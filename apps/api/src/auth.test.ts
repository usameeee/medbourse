import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { User } from './models/User.js';

const password = 'correcthorse';
const email = 'customer@example.com';

describe('auth', () => {
  let mongo: MongoMemoryServer;
  const app = createApp();

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

  it('registers a customer, sets a cookie, and hides the password hash', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      password,
      displayName: 'Amina',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.displayName).toBe('Amina');
    const cookies = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies.join(';') : String(cookies ?? '');
    expect(cookieHeader).toMatch(/mb_access=/);
  });

  it('rejects duplicate emails', async () => {
    await request(app).post('/api/v1/auth/register').send({ email, password });
    const res = await request(app).post('/api/v1/auth/register').send({ email, password });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('logs in and returns the session via cookie', async () => {
    await request(app).post('/api/v1/auth/register').send({ email, password });
    const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it('rejects wrong passwords with a generic error', async () => {
    await request(app).post('/api/v1/auth/register').send({ email, password });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'wronghorse1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('requires authentication for /me', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('forbids customers from staff-only routes', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({ email, password });
    const res = await agent.get('/api/v1/auth/staff-check');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
