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
import { City } from './models/City.js';
import { CountryAssignment } from './models/CountryAssignment.js';
import { Customer } from './models/Customer.js';
import { Invitation } from './models/Invitation.js';
import { Notification } from './models/Notification.js';
import { Offering } from './models/Offering.js';
import { Provider } from './models/Provider.js';
import { User } from './models/User.js';
import { WorkflowTemplate } from './models/WorkflowTemplate.js';

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

async function seedOffering(adminToken: string) {
  const city = await request(app)
    .post('/api/v1/catalog/cities')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
  const provider = await request(app)
    .post('/api/v1/catalog/providers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Desk', category: 'education', cityId: city.body.city.id });
  const offering = await request(app)
    .post('/api/v1/catalog/offerings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      slug: 'prep-support',
      title: 'Application support',
      summary: 'Document coordination for university applications.',
      providerId: provider.body.provider.id,
    });
  return offering.body.offering.id as string;
}

async function linkCustomer(staffToken: string, customerId: string, email: string) {
  const invited = await request(app)
    .post(`/api/v1/customers/${customerId}/invitations`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({});
  const linked = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
    invitationToken: invited.body.token,
  });
  return {
    id: linked.body.user.id as string,
    token: signAccessToken(linked.body.user.id, 'customer'),
  };
}

describe('in-app notifications', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Notification.deleteMany({});
    await AuditLog.deleteMany({});
    await Case.deleteMany({});
    await Invitation.deleteMany({});
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await CountryAssignment.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
    await WorkflowTemplate.deleteMany({});
    await mongoose.connection.db.collection('workflowtemplateversions').deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('notifies the case counterpart on messages and never the actor', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });
    const offeringId = await seedOffering(admin.token);

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla-notify@example.com', countryCode: 'MA' });
    const customerId = customer.body.customer.id as string;
    const owner = await linkCustomer(staff.token, customerId, 'layla-notify@example.com');

    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId, offeringId });
    const caseId = opened.body.case.id as string;

    // Staff posts → the customer is notified, the staff actor is not.
    const staffPost = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ body: 'We received your file.' });
    expect(staffPost.status).toBe(201);

    const ownerList = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.data).toHaveLength(1);
    expect(ownerList.body.data[0].type).toBe('case.message_created');
    expect(ownerList.body.data[0].caseId).toBe(caseId);
    expect(ownerList.body.data[0].readAt).toBeNull();
    expect(ownerList.body.meta.unread).toBe(1);

    const staffList = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(staffList.status).toBe(200);
    expect(staffList.body.data).toHaveLength(0);

    // The customer replies → the staff is notified.
    const ownerPost = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ body: 'Thank you. Any update?' });
    expect(ownerPost.status).toBe(201);

    const staffListAfter = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(staffListAfter.body.data).toHaveLength(1);
    expect(staffListAfter.body.data[0].metadata.authorRole).toBe('customer');

    // The customer still sees only their own single notification.
    const ownerListAfter = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(ownerListAfter.body.data).toHaveLength(1);

    // A user cannot mark someone else's notification as read.
    const staffNotificationId = staffListAfter.body.data[0].id as string;
    const crossRead = await request(app)
      .patch(`/api/v1/notifications/${staffNotificationId}/read`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(crossRead.status).toBe(404);

    // Marking own notification read flips the unread count.
    const ownerNotificationId = ownerListAfter.body.data[0].id as string;
    const read = await request(app)
      .patch(`/api/v1/notifications/${ownerNotificationId}/read`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(read.status).toBe(200);
    expect(read.body.notification.readAt).not.toBeNull();

    const ownerAfterRead = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(ownerAfterRead.body.meta.unread).toBe(0);
  });

  it('notifies the customer on workflow transitions and case close, with read-all support', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });
    const offeringId = await seedOffering(admin.token);

    await request(app)
      .post('/api/v1/workflow-templates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Education intake',
        category: 'education',
        stages: [
          { id: 'intake', name: 'Intake', order: 0 },
          { id: 'docs', name: 'Document review', order: 1 },
        ],
      });

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Omar', email: 'omar-notify@example.com', countryCode: 'MA' });
    const customerId = customer.body.customer.id as string;
    const owner = await linkCustomer(staff.token, customerId, 'omar-notify@example.com');

    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId, offeringId });
    const caseId = opened.body.case.id as string;
    expect(opened.body.case.workflow.stages).toHaveLength(2);

    const move = (stageId: string) =>
      request(app)
        .patch(`/api/v1/cases/${caseId}/workflow/stages/${stageId}`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ status: 'done' });

    expect((await move('intake')).status).toBe(200);
    expect((await move('docs')).status).toBe(200);
    const closed = await request(app)
      .patch(`/api/v1/cases/${caseId}/close`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(closed.status).toBe(200);

    const ownerList = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(ownerList.body.meta.unread).toBe(3);
    const types = ownerList.body.data.map((n: { type: string }) => n.type);
    expect(types).toContain('case.workflow_stage_transitioned');
    expect(types).toContain('case.closed');

    // The acting staff member is never notified of their own transitions.
    const staffList = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(staffList.body.data).toHaveLength(0);

    // unreadOnly filter and read-all.
    const unreadOnly = await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(unreadOnly.body.data).toHaveLength(3);

    const readAll = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(readAll.status).toBe(200);
    expect(readAll.body.updated).toBe(3);

    const afterReadAll = await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(afterReadAll.body.data).toHaveLength(0);
    expect(afterReadAll.body.meta.unread).toBe(0);

    const unauth = await request(app).get('/api/v1/notifications');
    expect(unauth.status).toBe(401);
  });
});
