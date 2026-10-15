import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
import { Offering } from './models/Offering.js';
import { PaymentEvidence } from './models/PaymentEvidence.js';
import { PricingRule } from './models/PricingRule.js';
import { Provider } from './models/Provider.js';
import { Quotation } from './models/Quotation.js';
import { User } from './models/User.js';
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

async function seedOffering(adminToken: string) {
  const city = await request(app)
    .post('/api/v1/catalog/cities')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
  const provider = await request(app)
    .post('/api/v1/catalog/providers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Desk',
      category: 'education',
      cityId: city.body.city.id,
    });
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

describe('case messages', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await AuditLog.deleteMany({});
    await Message.deleteMany({});
    await CaseDocument.deleteMany({});
    await PaymentEvidence.deleteMany({});
    await Case.deleteMany({});
    await Quotation.deleteMany({});
    await PricingRule.deleteMany({});
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

  it('lets staff and the linked customer exchange messages and blocks outsiders', async () => {
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
      .send({ fullName: 'Layla', email: 'layla-msg@example.com', countryCode: 'MA' });
    const customerId = customer.body.customer.id as string;

    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId, offeringId });
    const caseId = opened.body.case.id as string;

    const unauth = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .send({ body: 'Hello' });
    expect(unauth.status).toBe(401);

    const staffPost = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ body: 'We received your file.' });
    expect(staffPost.status).toBe(201);
    expect(staffPost.body.message.body).toBe('We received your file.');
    expect(staffPost.body.message.authorRole).toBe('staff');
    expect(staffPost.body.message.authorUserId).toBe(staff.user._id.toString());
    expect(staffPost.body.message.caseId).toBe(caseId);

    const stranger = await bearerFor('customer', 'stranger@example.com');
    const blocked = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ body: 'Let me in' });
    expect(blocked.status).toBe(403);

    const otherStaff = await bearerFor('staff', 'other-clerk@example.com');
    const outOfScope = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${otherStaff.token}`)
      .send({ body: 'Not my case' });
    expect(outOfScope.status).toBe(403);

    const invited = await request(app)
      .post(`/api/v1/customers/${customerId}/invitations`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({});
    const linked = await request(app).post('/api/v1/auth/register').send({
      email: 'layla-msg@example.com',
      password,
      invitationToken: invited.body.token,
    });
    expect(linked.status).toBe(201);
    const ownerToken = signAccessToken(linked.body.user.id, 'customer');

    const ownerPost = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Thank you. Any update?' });
    expect(ownerPost.status).toBe(201);
    expect(ownerPost.body.message.authorRole).toBe('customer');

    const ownerList = await request(app)
      .get(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.data).toHaveLength(2);
    expect(ownerList.body.data[0].body).toBe('We received your file.');
    expect(ownerList.body.data[1].body).toBe('Thank you. Any update?');

    const strangerList = await request(app)
      .get(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(strangerList.status).toBe(403);

    const audits = await AuditLog.find({ action: 'case.message_created' }).exec();
    expect(audits).toHaveLength(2);
    expect(audits.every((entry) => entry.entityId === caseId)).toBe(true);
  });

  it('validates the message body', async () => {
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
      .send({ fullName: 'Layla', email: 'layla-msg2@example.com', countryCode: 'MA' });
    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId });
    const caseId = opened.body.case.id as string;

    const empty = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ body: '' });
    expect(empty.status).toBe(400);

    const blank = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ body: '   ' });
    expect(blank.status).toBe(400);

    const missing = await request(app)
      .post(`/api/v1/cases/${caseId}/messages`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({});
    expect(missing.status).toBe(400);

    const unknownCase = await request(app)
      .get(`/api/v1/cases/${new mongoose.Types.ObjectId().toString()}/messages`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(unknownCase.status).toBe(404);
  });
});
