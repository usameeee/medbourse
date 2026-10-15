import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { UserRole } from '@medbourse/shared';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { AuditLog } from './models/AuditLog.js';
import { Case } from './models/Case.js';
import { CaseDocument } from './models/CaseDocument.js';
import { City } from './models/City.js';
import { CountryAssignment } from './models/CountryAssignment.js';
import { Customer } from './models/Customer.js';
import { Invitation } from './models/Invitation.js';
import { Message } from './models/Message.js';
import { Notification } from './models/Notification.js';
import { Offering } from './models/Offering.js';
import { PaymentAccount } from './models/PaymentAccount.js';
import { PaymentEvidence } from './models/PaymentEvidence.js';
import { PricingRule } from './models/PricingRule.js';
import { Provider } from './models/Provider.js';
import { Quotation } from './models/Quotation.js';
import { User } from './models/User.js';
import { WorkflowTemplate, WorkflowTemplateVersion } from './models/WorkflowTemplate.js';

const app = createApp();
const password = 'correcthorse';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n');

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function bearerFor(role: UserRole, email: string) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role,
  });
  return { token: signAccessToken(user._id.toString(), user.role), user };
}

/**
 * P9-T02 — assertions against the `docs/SECURITY.md` threat model:
 * authentication required, the shared role/permission matrix, cross-customer
 * IDOR, privilege escalation via public registration, and audit/secrets hygiene.
 */
describe('security & authorization matrix (QA)', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await AuditLog.deleteMany({});
    await Notification.deleteMany({});
    await Message.deleteMany({});
    await PaymentEvidence.deleteMany({});
    await CaseDocument.deleteMany({});
    await Case.deleteMany({});
    await Quotation.deleteMany({});
    await PricingRule.deleteMany({});
    await PaymentAccount.deleteMany({});
    await WorkflowTemplateVersion.deleteMany({});
    await WorkflowTemplate.deleteMany({});
    await Invitation.deleteMany({});
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await CountryAssignment.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('rejects anonymous access to every protected route with 401', async () => {
    const probes = [
      { label: 'GET /customers', run: () => request(app).get('/api/v1/customers') },
      { label: 'POST /customers', run: () => request(app).post('/api/v1/customers') },
      {
        label: 'GET /customers/queue/unassigned',
        run: () => request(app).get('/api/v1/customers/queue/unassigned'),
      },
      { label: 'GET /users/managers', run: () => request(app).get('/api/v1/users/managers') },
      {
        label: 'GET /country-assignments',
        run: () => request(app).get('/api/v1/country-assignments'),
      },
      { label: 'GET /cases', run: () => request(app).get('/api/v1/cases') },
      { label: 'POST /cases', run: () => request(app).post('/api/v1/cases') },
      { label: 'GET /pricing-rules', run: () => request(app).get('/api/v1/pricing-rules') },
      { label: 'GET /payment-accounts', run: () => request(app).get('/api/v1/payment-accounts') },
      {
        label: 'GET /workflow-templates',
        run: () => request(app).get('/api/v1/workflow-templates'),
      },
      { label: 'GET /audit', run: () => request(app).get('/api/v1/audit') },
      { label: 'GET /notifications', run: () => request(app).get('/api/v1/notifications') },
    ];

    for (const probe of probes) {
      const res = await probe.run();
      expect(res.status, probe.label).toBe(401);
    }
  });

  it('serves the public catalog without authentication', async () => {
    const res = await request(app).get('/api/v1/catalog/offerings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('enforces the permission matrix: customer cannot reach staff/admin surfaces', async () => {
    const customer = await bearerFor('customer', 'customer@example.com');
    const probes = [
      { label: 'GET /customers', run: () => request(app).get('/api/v1/customers') },
      { label: 'POST /customers', run: () => request(app).post('/api/v1/customers') },
      { label: 'GET /users/managers', run: () => request(app).get('/api/v1/users/managers') },
      {
        label: 'GET /country-assignments',
        run: () => request(app).get('/api/v1/country-assignments'),
      },
      { label: 'GET /audit', run: () => request(app).get('/api/v1/audit') },
      { label: 'POST /pricing-rules', run: () => request(app).post('/api/v1/pricing-rules') },
      {
        label: 'POST /payment-accounts',
        run: () => request(app).post('/api/v1/payment-accounts'),
      },
      {
        label: 'POST /workflow-templates',
        run: () => request(app).post('/api/v1/workflow-templates'),
      },
      {
        label: 'PATCH /cases/:id/close',
        run: () =>
          request(app).patch('/api/v1/cases/000000000000000000000000/close'),
      },
      {
        label: 'PATCH /cases/:id/workflow/stages/:stageId',
        run: () =>
          request(app).patch('/api/v1/cases/000000000000000000000000/workflow/stages/documents'),
      },
    ];

    for (const probe of probes) {
      const res = await probe.run().set(auth(customer.token)).send({});
      expect(res.status, probe.label).toBe(403);
      expect(res.body.error?.code, probe.label).toBe('FORBIDDEN');
    }
  });

  it('enforces the permission matrix: staff cannot reach admin/super_admin surfaces', async () => {
    const staff = await bearerFor('staff', 'staff@example.com');
    const probes = [
      { label: 'GET /users/managers', run: () => request(app).get('/api/v1/users/managers') },
      {
        label: 'GET /country-assignments',
        run: () => request(app).get('/api/v1/country-assignments'),
      },
      {
        label: 'PUT /country-assignments',
        run: () => request(app).put('/api/v1/country-assignments'),
      },
      { label: 'GET /audit', run: () => request(app).get('/api/v1/audit') },
      { label: 'POST /catalog/cities', run: () => request(app).post('/api/v1/catalog/cities') },
      { label: 'POST /pricing-rules', run: () => request(app).post('/api/v1/pricing-rules') },
      {
        label: 'POST /payment-accounts',
        run: () => request(app).post('/api/v1/payment-accounts'),
      },
      {
        label: 'POST /workflow-templates',
        run: () => request(app).post('/api/v1/workflow-templates'),
      },
    ];

    for (const probe of probes) {
      const res = await probe.run().set(auth(staff.token)).send({});
      expect(res.status, probe.label).toBe(403);
    }
  });

  it('enforces the permission matrix: admin cannot reach super_admin surfaces', async () => {
    const admin = await bearerFor('admin', 'admin@example.com');
    const probes = [
      { label: 'GET /audit', run: () => request(app).get('/api/v1/audit') },
      { label: 'POST /catalog/cities', run: () => request(app).post('/api/v1/catalog/cities') },
      { label: 'POST /pricing-rules', run: () => request(app).post('/api/v1/pricing-rules') },
      {
        label: 'POST /payment-accounts',
        run: () => request(app).post('/api/v1/payment-accounts'),
      },
      {
        label: 'POST /workflow-templates',
        run: () => request(app).post('/api/v1/workflow-templates'),
      },
    ];

    for (const probe of probes) {
      const res = await probe.run().set(auth(admin.token)).send({});
      expect(res.status, probe.label).toBe(403);
    }
  });

  it('blocks cross-customer IDOR on cases, documents, messages, quotations and receipts', async () => {
    const admin = await bearerFor('super_admin', 'owner@example.com');
    const staff = await bearerFor('staff', 'operator@example.com');

    const city = await City.create({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
    const provider = await Provider.create({
      name: 'Desk',
      category: 'education',
      cityId: city._id,
      countryCode: 'TR',
    });
    const offering = await Offering.create({
      slug: 'admission-support',
      title: 'Admission support',
      summary: 'Coordination.',
      providerId: provider._id,
      cityId: city._id,
      countryCode: 'TR',
      category: 'education',
    });
    await request(app)
      .post('/api/v1/pricing-rules')
      .set(auth(admin.token))
      .send({ amount: '100.00', currency: 'EUR' });

    async function onboard(email: string, fullName: string) {
      const customer = await request(app)
        .post('/api/v1/customers')
        .set(auth(staff.token))
        .send({ fullName, email, countryCode: 'MA' });
      const customerId = customer.body.customer.id as string;
      const invited = await request(app)
        .post(`/api/v1/customers/${customerId}/invitations`)
        .set(auth(staff.token))
        .send({});
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .send({ email, password, invitationToken: invited.body.token });
      return {
        customerId,
        userId: registered.body.user.id as string,
        token: signAccessToken(registered.body.user.id, 'customer'),
      };
    }

    const alice = await onboard('alice@example.com', 'Alice');
    const bob = await onboard('bob@example.com', 'Bob');

    const quotationA = await request(app)
      .post('/api/v1/quotations')
      .set(auth(staff.token))
      .send({ customerId: alice.customerId, offeringId: offering._id.toString() });
    const caseA = await request(app)
      .post('/api/v1/cases')
      .set(auth(staff.token))
      .send({
        customerId: alice.customerId,
        offeringId: offering._id.toString(),
        quotationId: quotationA.body.quotation.id,
      });
    await request(app)
      .post(`/api/v1/cases/${caseA.body.case.id}/documents`)
      .set(auth(alice.token))
      .query({ kind: 'identity' })
      .attach('file', pdf, { filename: 'alice.pdf', contentType: 'application/pdf' });

    const quotationB = await request(app)
      .post('/api/v1/quotations')
      .set(auth(staff.token))
      .send({ customerId: bob.customerId, offeringId: offering._id.toString() });
    const caseB = await request(app)
      .post('/api/v1/cases')
      .set(auth(staff.token))
      .send({
        customerId: bob.customerId,
        offeringId: offering._id.toString(),
        quotationId: quotationB.body.quotation.id,
      });
    await request(app)
      .post(`/api/v1/cases/${caseB.body.case.id}/messages`)
      .set(auth(bob.token))
      .send({ body: 'Hello from Bob.' });
    const evidenceB = await request(app)
      .post(`/api/v1/quotations/${quotationB.body.quotation.id}/payment-evidence`)
      .set(auth(bob.token))
      .attach('file', pdf, { filename: 'bob-receipt.pdf', contentType: 'application/pdf' });
    // Upline receipt is evidence for review, never automatic approval.
    expect(evidenceB.body.evidence.status).toBe('submitted');

    const bobNotification = await Notification.create({
      recipientUserId: bob.userId,
      type: 'case.closed',
      caseId: caseB.body.case.id,
      metadata: {},
    });

    const caseAId = caseA.body.case.id as string;
    const caseBId = caseB.body.case.id as string;
    const quotationBId = quotationB.body.quotation.id as string;
    const evidenceBId = evidenceB.body.evidence.id as string;

    // Control: Alice can read her own case.
    const ownCase = await request(app)
      .get(`/api/v1/cases/${caseAId}`)
      .set(auth(alice.token));
    expect(ownCase.status).toBe(200);

    const idorProbes = [
      {
        label: 'GET case (owner)',
        body: {} as Record<string, unknown>,
        run: () => request(app).get(`/api/v1/cases/${caseBId}`),
      },
      {
        label: 'GET case documents',
        body: {} as Record<string, unknown>,
        run: () => request(app).get(`/api/v1/cases/${caseBId}/documents`),
      },
      {
        label: 'GET case messages',
        body: {} as Record<string, unknown>,
        run: () => request(app).get(`/api/v1/cases/${caseBId}/messages`),
      },
      {
        label: 'POST case message',
        body: { body: 'Trying to read a foreign case.' },
        run: () => request(app).post(`/api/v1/cases/${caseBId}/messages`),
      },
      {
        label: 'GET quotation',
        body: {} as Record<string, unknown>,
        run: () => request(app).get(`/api/v1/quotations/${quotationBId}`),
      },
      {
        label: 'GET payment instructions',
        body: {} as Record<string, unknown>,
        run: () => request(app).get(`/api/v1/quotations/${quotationBId}/payment-instructions`),
      },
      {
        label: 'GET receipt signed-url',
        body: {} as Record<string, unknown>,
        run: () => request(app).get(`/api/v1/payment-evidence/${evidenceBId}/signed-url`),
      },
    ];

    for (const probe of idorProbes) {
      const res = await probe.run().set(auth(alice.token)).send(probe.body);
      expect(res.status, probe.label).toBe(403);
    }

    const foreignNotification = await request(app)
      .patch(`/api/v1/notifications/${bobNotification._id.toString()}/read`)
      .set(auth(alice.token));
    expect(foreignNotification.status).toBe(404);
  });

  it('does not let public registration choose a privileged role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'escalate@example.com', password, role: 'super_admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
  });

  it('stores only the IBAN tail in the audit trail', async () => {
    const admin = await bearerFor('super_admin', 'owner@example.com');
    const iban = 'DE89370400440532013000';
    await request(app)
      .post('/api/v1/payment-accounts')
      .set(auth(admin.token))
      .send({
        currency: 'EUR',
        label: 'Main',
        beneficiaryName: 'Medbourse',
        bankName: 'Example Bank',
        iban,
      });

    const audit = await request(app)
      .get('/api/v1/audit?entityType=PaymentAccount')
      .set(auth(admin.token));
    const entry = audit.body.data.find(
      (row: { action: string }) => row.action === 'payment_account.created',
    );
    expect(entry).toBeTruthy();
    expect(entry.metadata.ibanTail).toBe('3000');
    expect(JSON.stringify(entry.metadata)).not.toContain(iban);
  });

  it('never leaks stack traces or internal details in error bodies', async () => {
    const customer = await bearerFor('customer', 'customer@example.com');
    const res = await request(app).get('/api/v1/audit').set(auth(customer.token));
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|node_modules/);
  });
});
