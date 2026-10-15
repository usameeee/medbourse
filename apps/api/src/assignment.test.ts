import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { AuditLog } from './models/AuditLog.js';
import { CountryAssignment } from './models/CountryAssignment.js';
import { Customer } from './models/Customer.js';
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
  return {
    token: signAccessToken(user._id.toString(), user.role),
    user,
  };
}

describe('country assignment', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await AuditLog.deleteMany({});
    await CountryAssignment.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('assigns a new customer from the country map and leaves existing assignments unchanged when the map changes', async () => {
    const admin = await bearerFor('admin', 'admin@example.com');
    const managerA = await bearerFor('staff', 'manager-a@example.com');
    const managerB = await bearerFor('staff', 'manager-b@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');

    const mapped = await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ countryCode: 'ma', managerUserIds: [managerA.user._id.toString()] });
    expect(mapped.status).toBe(201);

    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla Haddad', email: 'layla@example.com', countryCode: 'MA' });
    expect(created.status).toBe(201);
    expect(created.body.customer.assignmentStatus).toBe('assigned');
    expect(created.body.customer.assignedManagerUserId).toBe(managerA.user._id.toString());

    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [managerB.user._id.toString()] });

    const again = await request(app)
      .get(`/api/v1/customers/${created.body.customer.id}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(again.body.customer.assignedManagerUserId).toBe(managerA.user._id.toString());
  });

  it('puts customers in the unassigned queue when no mapping exists', async () => {
    const staff = await bearerFor('staff', 'clerk@example.com');
    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'No Map', email: 'nomap@example.com', countryCode: 'TN' });
    expect(created.body.customer.assignmentStatus).toBe('unassigned');

    const queue = await request(app)
      .get('/api/v1/customers/queue/unassigned')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(queue.status).toBe(200);
    expect(queue.body.meta.total).toBe(1);
    expect(queue.body.data[0].email).toBe('nomap@example.com');
  });

  it('uses exception status when the mapped manager is inactive', async () => {
    const admin = await bearerFor('admin', 'admin@example.com');
    const manager = await bearerFor('staff', 'inactive@example.com');
    const mapped = await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ countryCode: 'DZ', managerUserIds: [manager.user._id.toString()] });
    expect(mapped.status).toBe(201);
    manager.user.isActive = false;
    await manager.user.save();

    const staff = await bearerFor('staff', 'clerk@example.com');
    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Exception Case', email: 'ex@example.com', countryCode: 'DZ' });
    expect(created.status).toBe(201);
    expect(created.body.customer.assignmentStatus).toBe('exception');
    expect(created.body.customer.assignedManagerUserId).toBeNull();
  });

  it('records an audit entry when an admin reassigns a customer', async () => {
    const admin = await bearerFor('admin', 'admin@example.com');
    const manager = await bearerFor('staff', 'manager@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Reassign Me', email: 're@example.com', countryCode: 'TR' });

    const res = await request(app)
      .post(`/api/v1/customers/${created.body.customer.id}/assignment`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ managerUserId: manager.user._id.toString(), reason: 'Country desk coverage' });
    expect(res.status).toBe(200);
    expect(res.body.customer.assignmentStatus).toBe('assigned');
    expect(res.body.customer.assignedManagerUserId).toBe(manager.user._id.toString());

    const staffDenied = await request(app)
      .post(`/api/v1/customers/${created.body.customer.id}/assignment`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ managerUserId: manager.user._id.toString(), reason: 'Should fail' });
    expect(staffDenied.status).toBe(403);

    const logs = await AuditLog.find({ action: 'customer.reassigned' }).exec();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.metadata).toMatchObject({
      reason: 'Country desk coverage',
      toManagerUserId: manager.user._id.toString(),
    });
  });
});
