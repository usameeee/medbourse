import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { City } from './models/City.js';
import { Offering } from './models/Offering.js';
import { Provider } from './models/Provider.js';
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

describe('catalog', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('lets only super_admin create cities and providers; partnership defaults to unverified', async () => {
    const staff = await bearerFor('staff', 'staff@example.com');
    const denied = await request(app)
      .post('/api/v1/catalog/cities')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
    expect(denied.status).toBe(403);

    const admin = await bearerFor('super_admin', 'root@example.com');
    const city = await request(app)
      .post('/api/v1/catalog/cities')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: 'istanbul', name: 'Istanbul', countryCode: 'tr' });
    expect(city.status).toBe(201);
    expect(city.body.city.countryCode).toBe('TR');

    const provider = await request(app)
      .post('/api/v1/catalog/providers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Example Coordination Partner',
        category: 'education',
        cityId: city.body.city.id,
      });
    expect(provider.status).toBe(201);
    expect(provider.body.provider.partnershipVerified).toBe(false);
    expect(provider.body.provider.countryCode).toBe('TR');

    const list = await request(app).get('/api/v1/catalog/cities');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('hides inactive cities from the public list', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const city = await request(app)
      .post('/api/v1/catalog/cities')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: 'ankara', name: 'Ankara', countryCode: 'TR' });
    await request(app)
      .patch(`/api/v1/catalog/cities/${city.body.city.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false });

    const publicList = await request(app).get('/api/v1/catalog/cities');
    expect(publicList.body.data).toHaveLength(0);

    const all = await request(app)
      .get('/api/v1/catalog/cities?includeInactive=true')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(all.body.data).toHaveLength(1);
  });

  it('creates offerings from the provider category and rejects guarantee language', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const city = await request(app)
      .post('/api/v1/catalog/cities')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: 'antalya', name: 'Antalya', countryCode: 'TR' });
    const provider = await request(app)
      .post('/api/v1/catalog/providers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Coastal Coordination Desk',
        category: 'education',
        cityId: city.body.city.id,
      });

    const blocked = await request(app)
      .post('/api/v1/catalog/offerings')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: 'guaranteed-admission',
        title: 'Guaranteed admission',
        summary: 'We guarantee a visa.',
        providerId: provider.body.provider.id,
      });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe('GUARANTEE_LANGUAGE');

    const created = await request(app)
      .post('/api/v1/catalog/offerings')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: 'computer-engineering-prep',
        title: 'Computer engineering application support',
        summary: 'Document checklist and university application coordination in Türkiye.',
        requirementsSummary: 'Passport copy and academic transcripts.',
        providerId: provider.body.provider.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.offering.category).toBe('education');
    expect(created.body.offering.disclaimer).toMatch(/does not guarantee/i);

    const listed = await request(app).get('/api/v1/catalog/offerings?category=education');
    expect(listed.body.data).toHaveLength(1);
  });
});
