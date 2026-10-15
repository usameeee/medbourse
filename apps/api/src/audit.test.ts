import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { AuditLog } from './models/AuditLog.js';
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

describe('audit log', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await AuditLog.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('lets super_admin list audit logs sorted by createdAt desc with pagination', async () => {
    const root = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      const doc = await AuditLog.create({
        actorUserId: staff.user._id,
        action: `case.action${n}`,
        entityType: 'Case',
        entityId: new mongoose.Types.ObjectId().toString(),
        metadata: { n },
      });
      ids.push(doc._id.toString());
    }

    const first = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`)
      .query({ limit: 2 });
    expect(first.status).toBe(200);
    expect(first.body.meta.total).toBe(3);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.data[0].id).toBe(ids[2]);
    expect(first.body.data[1].id).toBe(ids[1]);

    const second = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`)
      .query({ page: 2, limit: 2 });
    expect(second.status).toBe(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].id).toBe(ids[0]);
  });

  it('filters audit logs by action, entityType, and actorUserId', async () => {
    const root = await bearerFor('super_admin', 'root@example.com');
    const staffA = await bearerFor('staff', 'a@example.com');
    const staffB = await bearerFor('staff', 'b@example.com');

    await AuditLog.create([
      { actorUserId: staffA.user._id, action: 'case.created', entityType: 'Case', entityId: 'c1', metadata: {} },
      { actorUserId: staffA.user._id, action: 'case.closed', entityType: 'Case', entityId: 'c1', metadata: {} },
      { actorUserId: staffB.user._id, action: 'customer.created', entityType: 'Customer', entityId: 'cu1', metadata: {} },
      { actorUserId: staffB.user._id, action: 'payment_evidence.approved', entityType: 'PaymentEvidence', entityId: 'p1', metadata: {} },
    ]);

    const byAction = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`)
      .query({ action: 'case.created' });
    expect(byAction.body.meta.total).toBe(1);
    expect(byAction.body.data[0].action).toBe('case.created');

    const byEntity = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`)
      .query({ entityType: 'Case' });
    expect(byEntity.body.meta.total).toBe(2);

    const byActor = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`)
      .query({ actorUserId: staffA.user._id.toString() });
    expect(byActor.body.meta.total).toBe(2);

    const combined = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`)
      .query({ entityType: 'Case', actorUserId: staffA.user._id.toString() });
    expect(combined.body.meta.total).toBe(2);
  });

  it('rejects staff, admin, and customer with 403', async () => {
    const staff = await bearerFor('staff', 'clerk@example.com');
    const admin = await bearerFor('admin', 'admin@example.com');
    const customer = await bearerFor('customer', 'cust@example.com');

    for (const bearer of [staff, admin, customer]) {
      const res = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${bearer.token}`);
      expect(res.status).toBe(403);
    }
  });

  it('returns 400 for invalid actorUserId and out-of-range limit', async () => {
    const root = await bearerFor('super_admin', 'root@example.com');

    const badActor = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`)
      .query({ actorUserId: 'not-an-object-id' });
    expect(badActor.status).toBe(400);

    const badLimit = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`)
      .query({ limit: 9999 });
    expect(badLimit.status).toBe(400);
  });

  it('exposes action, entityType, actorUserId, metadata, and createdAt', async () => {
    const root = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const created = await AuditLog.create({
      actorUserId: staff.user._id,
      action: 'case.created',
      entityType: 'Case',
      entityId: 'abc123',
      metadata: { customerId: 'cust-1' },
    });

    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${root.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: created._id.toString(),
      actorUserId: staff.user._id.toString(),
      action: 'case.created',
      entityType: 'Case',
      entityId: 'abc123',
      metadata: { customerId: 'cust-1' },
    });
    expect(res.body.data[0].createdAt).toBeTruthy();
  });
});
