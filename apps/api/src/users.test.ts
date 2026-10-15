import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { UserRole } from '@medbourse/shared';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { User } from './models/User.js';

const app = createApp();

async function bearerFor(role: UserRole, email: string, isActive = true) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword('correcthorse'),
    role,
    isActive,
  });
  return { token: signAccessToken(user._id.toString(), user.role), user };
}

describe('manager directory', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('lists active staff, admin, and super_admin accounts for an admin — never customers or secrets', async () => {
    const admin = await bearerFor('admin', 'admin@example.com');
    await bearerFor('staff', 'staff@example.com');
    await bearerFor('super_admin', 'root@example.com');
    await bearerFor('customer', 'customer@example.com');
    await bearerFor('staff', 'inactive@example.com', false);

    const res = await request(app)
      .get('/api/v1/users/managers')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    const emails = (res.body.data as Array<{ email: string }>).map((m) => m.email);
    expect(emails).toEqual(['admin@example.com', 'root@example.com', 'staff@example.com']);
    expect(emails).not.toContain('customer@example.com');
    expect(emails).not.toContain('inactive@example.com');
    for (const manager of res.body.data) {
      expect(manager.passwordHash).toBeUndefined();
      expect(manager.role).toMatch(/^(staff|admin|super_admin)$/);
    }
  });

  it('forbids non-admin roles and unauthenticated callers', async () => {
    const staff = await bearerFor('staff', 'staff@example.com');
    const customer = await bearerFor('customer', 'customer@example.com');

    const asStaff = await request(app)
      .get('/api/v1/users/managers')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(asStaff.status).toBe(403);

    const asCustomer = await request(app)
      .get('/api/v1/users/managers')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(asCustomer.status).toBe(403);

    const anonymous = await request(app).get('/api/v1/users/managers');
    expect(anonymous.status).toBe(401);
  });
});
