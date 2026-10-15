import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { Customer } from './models/Customer.js';
import { Invitation } from './models/Invitation.js';
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

describe('invitations', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Invitation.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('links a new account only when the invitation token matches the email', async () => {
    const staff = await bearerFor('staff', 'staff@example.com');
    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla Haddad', email: 'layla@example.com', countryCode: 'MA' });
    const customerId = created.body.customer.id as string;

    const invited = await request(app)
      .post(`/api/v1/customers/${customerId}/invitations`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({});
    expect(invited.status).toBe(201);
    expect(invited.body.token).toBeTypeOf('string');
    expect(invited.body.invitation.email).toBe('layla@example.com');

    const guess = await request(app).post('/api/v1/auth/register').send({
      email: 'layla@example.com',
      password,
    });
    expect(guess.status).toBe(201);
    expect(guess.body.user.customerId).toBeNull();
    await User.deleteOne({ email: 'layla@example.com' });

    const wrongId = await request(app)
      .post(`/api/v1/customers/${customerId}/invitations`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ email: 'other@example.com' });
    expect(wrongId.status).toBe(400);

    const linked = await request(app).post('/api/v1/auth/register').send({
      email: 'layla@example.com',
      password,
      invitationToken: invited.body.token,
    });
    expect(linked.status).toBe(201);
    expect(linked.body.user.customerId).toBe(customerId);
  });

  it('rejects accepting by customer id without a token', async () => {
    const staff = await bearerFor('staff', 'staff@example.com');
    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Nour', email: 'nour@example.com', countryCode: 'TN' });
    const customer = await bearerFor('customer', 'nour@example.com');
    const res = await request(app)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ customerId: created.body.customer.id });
    expect(res.status).toBe(400);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(me.body.user.customerId).toBeNull();
  });

  it('revokes an invitation so the token cannot be used', async () => {
    const staff = await bearerFor('staff', 'staff@example.com');
    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Omar', email: 'omar@example.com', countryCode: 'TR' });
    const invited = await request(app)
      .post(`/api/v1/customers/${created.body.customer.id}/invitations`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({});
    const revoked = await request(app)
      .post(
        `/api/v1/customers/${created.body.customer.id}/invitations/${invited.body.invitation.id}/revoke`,
      )
      .set('Authorization', `Bearer ${staff.token}`);
    expect(revoked.status).toBe(200);

    const linked = await request(app).post('/api/v1/auth/register').send({
      email: 'omar@example.com',
      password,
      invitationToken: invited.body.token,
    });
    expect(linked.status).toBe(400);
    expect(linked.body.error.code).toBe('INVALID_INVITATION');
  });
});
