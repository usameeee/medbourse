import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { City } from './models/City.js';
import { Customer } from './models/Customer.js';
import { Invitation } from './models/Invitation.js';
import { Offering } from './models/Offering.js';
import { PaymentEvidence } from './models/PaymentEvidence.js';
import { PricingRule } from './models/PricingRule.js';
import { Provider } from './models/Provider.js';
import { Quotation } from './models/Quotation.js';
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

async function issueQuote() {
  const admin = await bearerFor('super_admin', 'root@example.com');
  const staff = await bearerFor('staff', 'clerk-pay@example.com');
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
  await request(app)
    .post('/api/v1/pricing-rules')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ amount: '250.50', currency: 'EUR' });
  const customer = await request(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${staff.token}`)
    .send({ fullName: 'Layla', email: 'layla-ev@example.com', countryCode: 'MA' });
  const issued = await request(app)
    .post('/api/v1/quotations')
    .set('Authorization', `Bearer ${staff.token}`)
    .send({ customerId: customer.body.customer.id, offeringId: offering.body.offering.id });
  return {
    staffToken: staff.token,
    quotationId: issued.body.quotation.id as string,
    customerId: customer.body.customer.id as string,
    amount: issued.body.quotation.amount as string,
  };
}

describe('payment evidence', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    resetMemoryStorage();
    await PaymentEvidence.deleteMany({});
    await Quotation.deleteMany({});
    await PricingRule.deleteMany({});
    await Invitation.deleteMany({});
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('treats a receipt upload as submitted evidence and does not mark the quotation paid', async () => {
    const { staffToken, quotationId, customerId, amount } = await issueQuote();
    const uploaded = await request(app)
      .post(`/api/v1/quotations/${quotationId}/payment-evidence`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', pdf, { filename: 'receipt.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.evidence.status).toBe('submitted');
    expect(uploaded.body.evidence.storageKey).toBeUndefined();
    expect(uploaded.body.quotation.amount).toBe(amount);
    expect(uploaded.body.quotation.paymentStatus).toBeUndefined();

    const invited = await request(app)
      .post(`/api/v1/customers/${customerId}/invitations`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({});
    const linked = await request(app).post('/api/v1/auth/register').send({
      email: 'layla-ev@example.com',
      password,
      invitationToken: invited.body.token,
    });
    const ownerToken = signAccessToken(linked.body.user.id, 'customer');

    const customerReview = await request(app)
      .post(`/api/v1/payment-evidence/${uploaded.body.evidence.id}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'approved' });
    expect(customerReview.status).toBe(403);

    const approved = await request(app)
      .post(`/api/v1/payment-evidence/${uploaded.body.evidence.id}/review`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ decision: 'approved' });
    expect(approved.status).toBe(200);
    expect(approved.body.evidence.status).toBe('approved');
    expect(approved.body.quotation.amount).toBe(amount);

    const again = await request(app)
      .get(`/api/v1/quotations/${quotationId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(again.body.quotation.amount).toBe('250.50');
    expect(again.body.quotation).not.toHaveProperty('paid');
  });

  it('requires a note when staff reject evidence', async () => {
    const { staffToken, quotationId } = await issueQuote();
    const uploaded = await request(app)
      .post(`/api/v1/quotations/${quotationId}/payment-evidence`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', pdf, { filename: 'receipt.pdf', contentType: 'application/pdf' });
    const missing = await request(app)
      .post(`/api/v1/payment-evidence/${uploaded.body.evidence.id}/review`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ decision: 'rejected' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('REVIEW_NOTE_REQUIRED');
    const rejected = await request(app)
      .post(`/api/v1/payment-evidence/${uploaded.body.evidence.id}/review`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ decision: 'rejected', note: 'Unreadable scan' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.evidence.status).toBe('rejected');
    expect(rejected.body.quotation.amount).toBe('250.50');
  });
});
