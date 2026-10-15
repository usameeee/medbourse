import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { normalizeAmount } from './money.js';
import { City } from './models/City.js';
import { Customer } from './models/Customer.js';
import { Offering } from './models/Offering.js';
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

async function seedCatalog(adminToken: string) {
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
  return { offeringId: offering.body.offering.id as string };
}

describe('pricing and quotations', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Quotation.deleteMany({});
    await PricingRule.deleteMany({});
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

  it('normalizes amounts with decimal arithmetic, not floats', () => {
    expect(normalizeAmount('10.1')).toBe('10.10');
    expect(normalizeAmount('0.1')).toBe('0.10');
  });

  it('picks the most specific rule and freezes the quotation when the rule later changes', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const { offeringId } = await seedCatalog(admin.token);

    await request(app)
      .post('/api/v1/pricing-rules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ amount: '100.00', currency: 'eur' });
    const specific = await request(app)
      .post('/api/v1/pricing-rules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerCountryCode: 'MA',
        offeringId,
        amount: '250.5',
        currency: 'EUR',
      });
    expect(specific.status).toBe(201);
    expect(specific.body.rule.amount).toBe('250.50');

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla-q@example.com', countryCode: 'MA' });

    const issued = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId });
    expect(issued.status).toBe(201);
    expect(issued.body.quotation.amount).toBe('250.50');
    expect(issued.body.quotation.currency).toBe('EUR');
    expect(issued.body.quotation.snapshot.customerCountryCode).toBe('MA');

    await PricingRule.findByIdAndUpdate(specific.body.rule.id, { amount: '999.00' });
    const again = await request(app)
      .get(`/api/v1/quotations/${issued.body.quotation.id}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(again.body.quotation.amount).toBe('250.50');
  });

  it('rejects two equally specific matching rules', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const { offeringId } = await seedCatalog(admin.token);
    await request(app)
      .post('/api/v1/pricing-rules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ customerCountryCode: 'TN', amount: '10.00', currency: 'EUR' });
    await request(app)
      .post('/api/v1/pricing-rules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ customerCountryCode: 'TN', amount: '20.00', currency: 'USD' });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Nour', email: 'nour-q@example.com', countryCode: 'TN' });
    const issued = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId });
    expect(issued.status).toBe(409);
    expect(issued.body.error.code).toBe('AMBIGUOUS_PRICING');
  });
});
