import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { City } from './models/City.js';
import { Customer } from './models/Customer.js';
import { Offering } from './models/Offering.js';
import { PaymentAccount } from './models/PaymentAccount.js';
import { PricingRule } from './models/PricingRule.js';
import { Provider } from './models/Provider.js';
import { Quotation } from './models/Quotation.js';
import { User } from './models/User.js';
import type { UserRole } from '@medbourse/shared';

const app = createApp();
const password = 'correcthorse';
const maIban = ['TR33', '0006', '1005', '1978', '6457', '8413', '26'].join('');
const globalIban = ['DE89', '3704', '0044', '0532', '0130', '00'].join('');
const updatedIban = ['TR32', '0010', '0099', '9990', '1234', '5678', '90'].join('');
const secondMaIban = ['TR71', '0006', '2000', '0001', '2345', '6789', '01'].join('');

async function bearerFor(role: UserRole, email: string) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role,
  });
  return { token: signAccessToken(user._id.toString(), user.role), user };
}

async function seedQuotedCustomer(adminToken: string, staffToken: string) {
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
  await request(app)
    .post('/api/v1/pricing-rules')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ amount: '250.50', currency: 'EUR' });
  const customer = await request(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ fullName: 'Layla', email: 'layla-pay@example.com', countryCode: 'MA' });
  const issued = await request(app)
    .post('/api/v1/quotations')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ customerId: customer.body.customer.id, offeringId: offering.body.offering.id });
  return { quotationId: issued.body.quotation.id as string };
}

describe('payment accounts', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Quotation.deleteMany({});
    await PricingRule.deleteMany({});
    await PaymentAccount.deleteMany({});
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

  it('lets only super_admin configure bank details and prefers a country-specific account', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const { quotationId } = await seedQuotedCustomer(admin.token, staff.token);

    const denied = await request(app)
      .post('/api/v1/payment-accounts')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({
        currency: 'EUR',
        label: 'EUR desk',
        beneficiaryName: 'MEDBOURSE',
        bankName: 'Example Bank',
        iban: globalIban,
      });
    expect(denied.status).toBe(403);

    const global = await request(app)
      .post('/api/v1/payment-accounts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        currency: 'eur',
        label: 'Global EUR',
        beneficiaryName: 'MEDBOURSE Coordinasyon',
        bankName: 'Example Bank DE',
        iban: ['DE89', '3704', '0044', '0532', '0130', '00'].join(' '),
      });
    expect(global.status).toBe(201);
    expect(global.body.paymentAccount.iban).toBe(globalIban);
    expect(global.body.paymentAccount.currency).toBe('EUR');

    const country = await request(app)
      .post('/api/v1/payment-accounts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerCountryCode: 'MA',
        currency: 'EUR',
        label: 'Morocco EUR',
        beneficiaryName: 'MEDBOURSE Coordinasyon',
        bankName: 'Example Bank TR',
        iban: maIban,
        swiftBic: ['TGBA', 'TR', 'IS'].join(''),
      });
    expect(country.status, JSON.stringify(country.body)).toBe(201);

    const instructions = await request(app)
      .get(`/api/v1/quotations/${quotationId}/payment-instructions`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(instructions.status).toBe(200);
    expect(instructions.body.paymentAccount.iban).toBe(maIban);
    expect(instructions.body.amount).toBe('250.50');

    await request(app)
      .patch(`/api/v1/payment-accounts/${country.body.paymentAccount.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ iban: updatedIban });

    const afterUpdate = await request(app)
      .get(`/api/v1/quotations/${quotationId}/payment-instructions`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(afterUpdate.body.paymentAccount.iban).toBe(updatedIban);
    expect(afterUpdate.body.amount).toBe('250.50');
  });

  it('rejects two equally specific accounts for the same country and currency', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const { quotationId } = await seedQuotedCustomer(admin.token, staff.token);

    await request(app)
      .post('/api/v1/payment-accounts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerCountryCode: 'MA',
        currency: 'EUR',
        label: 'A',
        beneficiaryName: 'MEDBOURSE',
        bankName: 'Bank A',
        iban: maIban,
      });
    await request(app)
      .post('/api/v1/payment-accounts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerCountryCode: 'MA',
        currency: 'EUR',
        label: 'B',
        beneficiaryName: 'MEDBOURSE',
        bankName: 'Bank B',
        iban: secondMaIban,
      });

    const instructions = await request(app)
      .get(`/api/v1/quotations/${quotationId}/payment-instructions`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(instructions.status).toBe(409);
    expect(instructions.body.error.code).toBe('AMBIGUOUS_PAYMENT_ACCOUNT');
  });

  it('returns 404 when no account matches the quotation currency', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const { quotationId } = await seedQuotedCustomer(admin.token, staff.token);
    await request(app)
      .post('/api/v1/payment-accounts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        currency: 'USD',
        label: 'USD only',
        beneficiaryName: 'MEDBOURSE',
        bankName: 'Example Bank',
        iban: globalIban,
      });
    const instructions = await request(app)
      .get(`/api/v1/quotations/${quotationId}/payment-instructions`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(instructions.status).toBe(404);
    expect(instructions.body.error.code).toBe('NO_PAYMENT_ACCOUNT');
  });
});
