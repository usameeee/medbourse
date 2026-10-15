import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { Case } from './models/Case.js';
import { City } from './models/City.js';
import { Customer } from './models/Customer.js';
import { Offering } from './models/Offering.js';
import { Provider } from './models/Provider.js';
import { User } from './models/User.js';
import { WorkflowTemplate } from './models/WorkflowTemplate.js';
import { AuditLog } from './models/AuditLog.js';
import type { UserRole } from '@medbourse/shared';

const app = createApp();
const password = 'correcthorse';

async function bearerFor(role: UserRole, email: string) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role,
  });
  return { token: signAccessToken(user._id.toString(), user.role), user };
}

function baseStages() {
  return [
    { id: 'intake', name: 'Intake', order: 0 },
    { id: 'docs', name: 'Document review', order: 1 },
    { id: 'submit', name: 'Submission', order: 2, optional: true },
  ];
}

describe('workflow templates', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Case.deleteMany({});
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
    await WorkflowTemplate.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.db.collection('workflowtemplateversions').deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('lets super_admin create a template with an initial version', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const res = await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Education intake',
        category: 'education',
        stages: baseStages(),
      });
    expect(res.status).toBe(201);
    expect(res.body.template.currentVersionNumber).toBe(1);
    expect(res.body.version.stages).toHaveLength(3);
    expect(res.body.version.stages[0].id).toBe('intake');
    expect(res.body.version.stages[2].optional).toBe(true);
  });

  it('forbids staff and admin from creating templates', async () => {
    const staff = await bearerFor('staff', 'clerk@example.com');
    const res = await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ name: 'X', category: 'medical', stages: baseStages() });
    expect(res.status).toBe(403);
  });

  it('rejects empty stages and duplicate stage ids', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const empty = await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Empty', category: 'tourism', stages: [] });
    expect(empty.status).toBe(400);

    const dup = await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Dup',
        category: 'tourism',
        stages: [
          { id: 'a', name: 'A', order: 0 },
          { id: 'a', name: 'A2', order: 1 },
        ],
      });
    expect(dup.status).toBe(400);
    expect(dup.body.error.code).toBe('DUPLICATE_STAGE_ID');
  });

  it('creates a new version without mutating previous versions', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const created = await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Medical flow', category: 'medical', stages: baseStages() });
    const templateId = created.body.template.id as string;

    const v2 = await request(app)
      .post(`/api/v1/workflow-templates/${templateId}/versions`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        stages: [
          { id: 'intake', name: 'Intake', order: 0 },
          { id: 'docs', name: 'Document review', order: 1 },
          { id: 'review', name: 'Medical review', order: 2 },
          { id: 'submit', name: 'Submission', order: 3 },
        ],
      });
    expect(v2.status).toBe(201);
    expect(v2.body.template.currentVersionNumber).toBe(2);
    expect(v2.body.version.stages).toHaveLength(4);

    const versions = await request(app)
      .get(`/api/v1/workflow-templates/${templateId}/versions`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(versions.body.data).toHaveLength(2);
    const v1 = versions.body.data.find((v: { versionNumber: number }) => v.versionNumber === 1);
    expect(v1.stages).toHaveLength(3);
  });

  it('snapshots the active template onto a new case and ignores later edits', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });

    const tpl = await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Edu flow', category: 'education', stages: baseStages() });

    const city = await City.create({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
    const provider = await Provider.create({
      name: 'Desk',
      category: 'education',
      cityId: city._id,
      countryCode: 'TR',
    });
    const offering = await Offering.create({
      slug: 'prep',
      title: 'Prep support',
      summary: 'Coordination',
      providerId: provider._id,
      cityId: city._id,
      countryCode: 'TR',
      category: 'education',
    });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla@example.com', countryCode: 'MA' });

    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId: offering._id.toString() });
    expect(opened.status).toBe(201);
    expect(opened.body.case.workflow).not.toBeNull();
    expect(opened.body.case.workflow.versionNumber).toBe(1);
    expect(opened.body.case.workflow.stages).toHaveLength(3);
    expect(opened.body.case.workflow.stages[0].status).toBe('pending');

    await request(app)
      .post(`/api/v1/workflow-templates/${tpl.body.template.id}/versions`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        stages: [
          { id: 'intake', name: 'Intake', order: 0 },
          { id: 'extra', name: 'Extra step', order: 1 },
        ],
      });

    const fetched = await request(app)
      .get(`/api/v1/cases/${opened.body.case.id}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(fetched.body.case.workflow.versionNumber).toBe(1);
    expect(fetched.body.case.workflow.stages).toHaveLength(3);
  });

  it('leaves workflow null when no active template exists for the category', async () => {
    const staff = await bearerFor('staff', 'clerk@example.com');
    const city = await City.create({ slug: 'ankara', name: 'Ankara', countryCode: 'TR' });
    const provider = await Provider.create({
      name: 'Clinic',
      category: 'medical',
      cityId: city._id,
      countryCode: 'TR',
    });
    const offering = await Offering.create({
      slug: 'checkup',
      title: 'Checkup',
      summary: 'Coordination',
      providerId: provider._id,
      cityId: city._id,
      countryCode: 'TR',
      category: 'medical',
    });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Omar', email: 'omar@example.com', countryCode: 'EG' });

    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId: offering._id.toString() });
    expect(opened.status).toBe(201);
    expect(opened.body.case.workflow).toBeNull();
  });

  it('updates template metadata without creating a new version', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const created = await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Old name', category: 'tourism', stages: baseStages() });
    const templateId = created.body.template.id as string;

    const patched = await request(app)
      .patch(`/api/v1/workflow-templates/${templateId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'New name', isActive: false });
    expect(patched.status).toBe(200);
    expect(patched.body.template.name).toBe('New name');
    expect(patched.body.template.isActive).toBe(false);
    expect(patched.body.template.currentVersionNumber).toBe(1);

    const versions = await request(app)
      .get(`/api/v1/workflow-templates/${templateId}/versions`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(versions.body.data).toHaveLength(1);
  });
});

describe('workflow stage transitions', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Case.deleteMany({});
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
    await WorkflowTemplate.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.db.collection('workflowtemplateversions').deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  async function openCaseWithWorkflow(adminToken: string, staffToken: string, staffUserId: string) {
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ countryCode: 'MA', managerUserIds: [staffUserId] });
    await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Edu flow', category: 'education', stages: baseStages() });
    const city = await City.create({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
    const provider = await Provider.create({
      name: 'Desk',
      category: 'education',
      cityId: city._id,
      countryCode: 'TR',
    });
    const offering = await Offering.create({
      slug: 'prep',
      title: 'Prep support',
      summary: 'Coordination',
      providerId: provider._id,
      cityId: city._id,
      countryCode: 'TR',
      category: 'education',
    });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ fullName: 'Layla', email: 'layla@example.com', countryCode: 'MA' });
    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ customerId: customer.body.customer.id, offeringId: offering._id.toString() });
    return opened.body.case.id as string;
  }

  it('lets staff advance a stage through pending -> in_progress -> done', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());

    const started = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'in_progress' });
    expect(started.status).toBe(200);
    expect(started.body.stage.status).toBe('in_progress');
    expect(started.body.previousStatus).toBe('pending');

    const done = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.stage.status).toBe('done');

    const fetched = await request(app)
      .get(`/api/v1/cases/${caseId}`)
      .set('Authorization', `Bearer ${staff.token}`);
    const intake = fetched.body.case.workflow.stages.find((s: { id: string }) => s.id === 'intake');
    expect(intake.status).toBe('done');
  });

  it('blocks completing a stage until previous non-optional stages are done', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());

    const blocked = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/docs`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'done' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PREREQUISITE_NOT_DONE');

    await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'done' });

    const allowed = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/docs`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'done' });
    expect(allowed.status).toBe(200);
  });

  it('allows skipping optional stages but not required ones', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());

    const skipOptional = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/submit`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'skipped' });
    expect(skipOptional.status).toBe(200);
    expect(skipOptional.body.stage.status).toBe('skipped');

    const skipRequired = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'skipped' });
    expect(skipRequired.status).toBe(400);
    expect(skipRequired.body.error.code).toBe('STAGE_NOT_OPTIONAL');
  });

  it('rejects invalid transitions and unknown stages', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());

    await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'done' });

    const revert = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'in_progress' });
    expect(revert.status).toBe(400);
    expect(revert.body.error.code).toBe('INVALID_TRANSITION');

    const unknown = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/nope`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'done' });
    expect(unknown.status).toBe(404);
  });

  it('forbids customers from transitioning stages', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const customer = await bearerFor('customer', 'layla@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());

    const blocked = await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'in_progress' });
    expect(blocked.status).toBe(403);
  });

  it('writes an audit log entry on every transition', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());

    await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'in_progress' });

    const logs = await AuditLog.find({ action: 'case.workflow_stage_transitioned' }).exec();
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata.stageId).toBe('intake');
    expect(logs[0].metadata.from).toBe('pending');
    expect(logs[0].metadata.to).toBe('in_progress');
  });
});

describe('case close', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Case.deleteMany({});
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
    await WorkflowTemplate.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.db.collection('workflowtemplateversions').deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  async function openCaseWithWorkflow(adminToken: string, staffToken: string, staffUserId: string) {
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ countryCode: 'MA', managerUserIds: [staffUserId] });
    await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Edu flow', category: 'education', stages: baseStages() });
    const city = await City.create({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
    const provider = await Provider.create({
      name: 'Desk',
      category: 'education',
      cityId: city._id,
      countryCode: 'TR',
    });
    const offering = await Offering.create({
      slug: 'prep',
      title: 'Prep support',
      summary: 'Coordination',
      providerId: provider._id,
      cityId: city._id,
      countryCode: 'TR',
      category: 'education',
    });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ fullName: 'Layla', email: 'layla@example.com', countryCode: 'MA' });
    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ customerId: customer.body.customer.id, offeringId: offering._id.toString() });
    return opened.body.case.id as string;
  }

  async function completeAllRequired(caseId: string, staffToken: string) {
    await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/intake`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'done' });
    await request(app)
      .patch(`/api/v1/cases/${caseId}/workflow/stages/docs`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'done' });
  }

  it('closes a case when all required stages are done', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());

    await completeAllRequired(caseId, staff.token);

    const closed = await request(app)
      .patch(`/api/v1/cases/${caseId}/close`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send();
    expect(closed.status).toBe(200);
    expect(closed.body.case.status).toBe('closed');

    const fetched = await request(app)
      .get(`/api/v1/cases/${caseId}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(fetched.body.case.status).toBe('closed');
  });

  it('rejects closing when required stages are not done', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());

    const blocked = await request(app)
      .patch(`/api/v1/cases/${caseId}/close`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send();
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('REQUIRED_STAGES_NOT_DONE');

    const fetched = await request(app)
      .get(`/api/v1/cases/${caseId}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(fetched.body.case.status).toBe('open');
  });

  it('rejects closing an already closed case', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());
    await completeAllRequired(caseId, staff.token);

    await request(app)
      .patch(`/api/v1/cases/${caseId}/close`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send();

    const again = await request(app)
      .patch(`/api/v1/cases/${caseId}/close`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send();
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CASE_ALREADY_CLOSED');
  });

  it('forbids customers from closing a case', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const customer = await bearerFor('customer', 'layla@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());
    await completeAllRequired(caseId, staff.token);

    const blocked = await request(app)
      .patch(`/api/v1/cases/${caseId}/close`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send();
    expect(blocked.status).toBe(403);
  });

  it('writes an audit log entry on close', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const caseId = await openCaseWithWorkflow(admin.token, staff.token, staff.user._id.toString());
    await completeAllRequired(caseId, staff.token);

    await request(app)
      .patch(`/api/v1/cases/${caseId}/close`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send();

    const logs = await AuditLog.find({ action: 'case.closed' }).exec();
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(caseId);
  });
});
