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
import { Customer } from './models/Customer.js';
import { Invitation } from './models/Invitation.js';
import { Offering } from './models/Offering.js';
import { Provider } from './models/Provider.js';
import { User } from './models/User.js';
import { resetMemoryStorage } from './storage/memory.js';
import type { UserRole } from '@medbourse/shared';

const app = createApp();
const password = 'correcthorse';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n');

async function bearerFor(role: UserRole, email: string) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role,
  });
  return { token: signAccessToken(user._id.toString(), user.role), user };
}

async function openCase() {
  const admin = await bearerFor('super_admin', 'root@example.com');
  const staff = await bearerFor('staff', 'clerk@example.com');
  await request(app)
    .put('/api/v1/country-assignments')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });
  const city = await request(app)
    .post('/api/v1/catalog/cities')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
  const provider = await request(app)
    .post('/api/v1/catalog/providers')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ name: 'Desk', category: 'education', cityId: city.body.city.id });
  const offering = await request(app)
    .post('/api/v1/catalog/offerings')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      slug: 'prep-support',
      title: 'Application support',
      summary: 'Document coordination for university applications.',
      providerId: provider.body.provider.id,
    });
  const customer = await request(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${staff.token}`)
    .send({ fullName: 'Layla', email: 'layla-doc@example.com', countryCode: 'MA' });
  const opened = await request(app)
    .post('/api/v1/cases')
    .set('Authorization', `Bearer ${staff.token}`)
    .send({ customerId: customer.body.customer.id, offeringId: offering.body.offering.id });
  return {
    staffToken: staff.token,
    caseId: opened.body.case.id as string,
    customerId: customer.body.customer.id as string,
  };
}

describe('case documents', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    resetMemoryStorage();
    await CaseDocument.deleteMany({});
    await Case.deleteMany({});
    await Invitation.deleteMany({});
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await Customer.deleteMany({});
    await AuditLog.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('stores files privately, issues a short signed URL, and hides storage keys from clients and audit', async () => {
    const { staffToken, caseId, customerId } = await openCase();
    const uploaded = await request(app)
      .post(`/api/v1/cases/${caseId}/documents`)
      .set('Authorization', `Bearer ${staffToken}`)
      .query({ kind: 'identity' })
      .attach('file', pdf, { filename: 'passport.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.document.kind).toBe('identity');
    expect(uploaded.body.document.storageKey).toBeUndefined();
    expect(uploaded.body.document.originalFilename).toBe('passport.pdf');

    const stranger = await bearerFor('customer', 'stranger-doc@example.com');
    const blocked = await request(app)
      .get(`/api/v1/cases/${caseId}/documents/${uploaded.body.document.id}/signed-url`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(blocked.status).toBe(403);

    const invited = await request(app)
      .post(`/api/v1/customers/${customerId}/invitations`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({});
    const linked = await request(app).post('/api/v1/auth/register').send({
      email: 'layla-doc@example.com',
      password,
      invitationToken: invited.body.token,
    });
    const ownerToken = signAccessToken(linked.body.user.id, 'customer');

    const signed = await request(app)
      .get(`/api/v1/cases/${caseId}/documents/${uploaded.body.document.id}/signed-url`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(signed.status).toBe(200);
    expect(signed.body.url).toMatch(/^\/api\/v1\/documents\/.+\/content\?exp=/);
    expect(JSON.stringify(signed.body)).not.toMatch(/cloudinary|api_secret/i);

    const downloaded = await request(app).get(signed.body.url);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toMatch(/pdf/);
    expect(Buffer.from(downloaded.body).subarray(0, 4).toString()).toBe('%PDF');

    const logs = await AuditLog.find({ action: 'document.uploaded' }).exec();
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0]?.metadata)).not.toContain('passport.pdf');
    expect(JSON.stringify(logs[0]?.metadata)).not.toContain('storageKey');
  });

  it('rejects unsupported types and expired download signatures', async () => {
    const { staffToken, caseId } = await openCase();
    const rejected = await request(app)
      .post(`/api/v1/cases/${caseId}/documents`)
      .set('Authorization', `Bearer ${staffToken}`)
      .query({ kind: 'supporting' })
      .attach('file', Buffer.from('not-a-pdf'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('UNSUPPORTED_TYPE');

    const uploaded = await request(app)
      .post(`/api/v1/cases/${caseId}/documents`)
      .set('Authorization', `Bearer ${staffToken}`)
      .query({ kind: 'medical' })
      .attach('file', pdf, { filename: 'scan.pdf', contentType: 'application/pdf' });
    const expired = await request(app).get(
      `/api/v1/documents/${uploaded.body.document.id}/content?exp=1&sig=00`,
    );
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('SIGNED_URL_EXPIRED');
  });
});
