import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { Customer } from './models/Customer.js';
import { User } from './models/User.js';

const app = createApp();
const password = 'correcthorse';

async function bearerFor(role: 'staff' | 'customer' | 'admin', email: string) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role,
  });
  return {
    token: signAccessToken(user._id.toString(), user.role),
    user,
  };
}

describe('customers', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Customer.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('forbids public-role customers from creating records', async () => {
    const { token } = await bearerFor('customer', 'user@example.com');
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Layla Haddad', countryCode: 'ma' });
    expect(res.status).toBe(403);
  });

  it('lets staff create a customer without a login', async () => {
    const { token, user } = await bearerFor('staff', 'staff@example.com');
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Layla Haddad',
        email: 'layla@example.com',
        phone: '+212600000000',
        countryCode: 'ma',
      });
    expect(res.status).toBe(201);
    expect(res.body.customer.fullName).toBe('Layla Haddad');
    expect(res.body.customer.email).toBe('layla@example.com');
    expect(res.body.customer.countryCode).toBe('MA');
    expect(res.body.customer.createdByUserId).toBe(user._id.toString());
    expect(res.body.customer.assignmentStatus).toBe('unassigned');
    expect(res.body.customer.assignedManagerUserId).toBeNull();
    expect(await User.countDocuments()).toBe(1);
  });

  it('rejects a second customer with the same email', async () => {
    const { token } = await bearerFor('staff', 'staff@example.com');
    const body = { fullName: 'Layla Haddad', email: 'layla@example.com', countryCode: 'MA' };
    await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CUSTOMER_EMAIL_IN_USE');
    expect(res.body.error.details.customerId).toBeTypeOf('string');
  });

  it('allows a linked account to read only its own customer', async () => {
    const staff = await bearerFor('staff', 'staff@example.com');
    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla Haddad', email: 'layla@example.com', countryCode: 'FR' });
    const customerId = created.body.customer.id as string;
    const other = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Other Person', email: 'other@example.com', countryCode: 'FR' });

    const linked = await bearerFor('customer', 'layla-login@example.com');
    linked.user.customerId = new mongoose.Types.ObjectId(customerId);
    await linked.user.save();
    const token = signAccessToken(linked.user._id.toString(), linked.user.role);

    const own = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(own.status).toBe(200);
    expect(own.body.customer.email).toBe('layla@example.com');

    const denied = await request(app)
      .get(`/api/v1/customers/${other.body.customer.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(denied.status).toBe(403);
  });
});
