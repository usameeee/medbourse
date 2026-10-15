import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { Case } from './models/Case.js';
import { CaseDocument } from './models/CaseDocument.js';
import { City } from './models/City.js';
import { CountryAssignment } from './models/CountryAssignment.js';
import { Customer } from './models/Customer.js';
import { Invitation } from './models/Invitation.js';
import { Offering } from './models/Offering.js';
import { PaymentEvidence } from './models/PaymentEvidence.js';
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

async function seedOffering(adminToken: string) {
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
  return offering.body.offering.id as string;
}

describe('cases', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await CaseDocument.deleteMany({});
    await PaymentEvidence.deleteMany({});
    await Case.deleteMany({});
    await Quotation.deleteMany({});
    await PricingRule.deleteMany({});
    await Invitation.deleteMany({});
    await Offering.deleteMany({});
    await Provider.deleteMany({});
    await City.deleteMany({});
    await CountryAssignment.deleteMany({});
    await Customer.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('lets staff open a case and lets only the linked customer read it', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });
    const offeringId = await seedOffering(admin.token);

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla-case@example.com', countryCode: 'MA' });
    const customerId = customer.body.customer.id as string;

    const denied = await request(app)
      .post('/api/v1/cases')
      .send({ customerId, offeringId });
    expect(denied.status).toBe(401);

    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId, offeringId });
    expect(opened.status).toBe(201);
    expect(opened.body.case.status).toBe('open');
    expect(opened.body.case.offeringTitle).toBe('Application support');
    expect(opened.body.case.quotationId).toBeNull();

    const stranger = await bearerFor('customer', 'stranger@example.com');
    const blocked = await request(app)
      .get(`/api/v1/cases/${opened.body.case.id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(blocked.status).toBe(403);

    const invited = await request(app)
      .post(`/api/v1/customers/${customerId}/invitations`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({});
    const linked = await request(app).post('/api/v1/auth/register').send({
      email: 'layla-case@example.com',
      password,
      invitationToken: invited.body.token,
    });
    expect(linked.status).toBe(201);
    const ownerToken = signAccessToken(linked.body.user.id, 'customer');

    const own = await request(app)
      .get(`/api/v1/cases/${opened.body.case.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(own.status).toBe(200);
    expect(own.body.case.customerId).toBe(customerId);

    const list = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.body.data).toHaveLength(1);

    const staffList = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(staffList.body.meta.total).toBe(1);
  });

  it('rejects a quotation that belongs to a different customer or offering', async () => {
    const admin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    const offeringId = await seedOffering(admin.token);
    await request(app)
      .post('/api/v1/pricing-rules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ amount: '100.00', currency: 'EUR' });
    const other = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Other', email: 'other-case@example.com', countryCode: 'TN' });
    const quoted = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: other.body.customer.id, offeringId });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla-mismatch@example.com', countryCode: 'MA' });
    const res = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({
        customerId: customer.body.customer.id,
        offeringId,
        quotationId: quoted.body.quotation.id,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUOTATION_MISMATCH');
  });

  it('scopes the staff case list to their country assignment and supports status/category filters', async () => {
    const superAdmin = await bearerFor('super_admin', 'root@example.com');
    const staffMA = await bearerFor('staff', 'clerk-ma@example.com');
    const staffTN = await bearerFor('staff', 'clerk-tn@example.com');

    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staffMA.user._id.toString()] });
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ countryCode: 'TN', managerUserIds: [staffTN.user._id.toString()] });

    const eduOfferingId = await seedOffering(superAdmin.token);
    const city = await City.create({ slug: 'ankara', name: 'Ankara', countryCode: 'TR' });
    const provider = await Provider.create({
      name: 'Clinic',
      category: 'medical',
      cityId: city._id,
      countryCode: 'TR',
    });
    const medOffering = await Offering.create({
      slug: 'checkup',
      title: 'Checkup',
      summary: 'Coordination',
      providerId: provider._id,
      cityId: city._id,
      countryCode: 'TR',
      category: 'medical',
    });

    const custMA = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffMA.token}`)
      .send({ fullName: 'Layla', email: 'layla-list@example.com', countryCode: 'MA' });
    const custTN = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staffTN.token}`)
      .send({ fullName: 'Omar', email: 'omar-list@example.com', countryCode: 'TN' });

    const openEdu = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staffMA.token}`)
      .send({ customerId: custMA.body.customer.id, offeringId: eduOfferingId });
    const closedMed = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staffMA.token}`)
      .send({ customerId: custMA.body.customer.id, offeringId: medOffering._id.toString() });
    await Case.findByIdAndUpdate(closedMed.body.case.id, { status: 'closed' }).exec();
    const tnCase = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staffTN.token}`)
      .send({ customerId: custTN.body.customer.id, offeringId: eduOfferingId });

    const maList = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', `Bearer ${staffMA.token}`);
    expect(maList.body.meta.total).toBe(2);
    expect(maList.body.data.map((c: { id: string }) => c.id).sort()).toEqual(
      [openEdu.body.case.id, closedMed.body.case.id].sort(),
    );

    const tnList = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', `Bearer ${staffTN.token}`);
    expect(tnList.body.meta.total).toBe(1);
    expect(tnList.body.data[0].id).toBe(tnCase.body.case.id);

    const superList = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(superList.body.meta.total).toBe(3);

    const openFilter = await request(app)
      .get('/api/v1/cases?status=open')
      .set('Authorization', `Bearer ${staffMA.token}`);
    expect(openFilter.body.meta.total).toBe(1);
    expect(openFilter.body.data[0].id).toBe(openEdu.body.case.id);

    const closedFilter = await request(app)
      .get('/api/v1/cases?status=closed')
      .set('Authorization', `Bearer ${staffMA.token}`);
    expect(closedFilter.body.meta.total).toBe(1);
    expect(closedFilter.body.data[0].id).toBe(closedMed.body.case.id);

    const eduFilter = await request(app)
      .get('/api/v1/cases?category=education')
      .set('Authorization', `Bearer ${staffMA.token}`);
    expect(eduFilter.body.meta.total).toBe(1);
    expect(eduFilter.body.data[0].id).toBe(openEdu.body.case.id);

    const medFilter = await request(app)
      .get('/api/v1/cases?category=medical')
      .set('Authorization', `Bearer ${staffMA.token}`);
    expect(medFilter.body.meta.total).toBe(1);
    expect(medFilter.body.data[0].id).toBe(closedMed.body.case.id);

    const customerFilter = await request(app)
      .get(`/api/v1/cases?customerId=${custMA.body.customer.id}`)
      .set('Authorization', `Bearer ${staffMA.token}`);
    expect(customerFilter.body.meta.total).toBe(2);

    const outOfScopeCustomer = await request(app)
      .get(`/api/v1/cases?customerId=${custTN.body.customer.id}`)
      .set('Authorization', `Bearer ${staffMA.token}`);
    expect(outOfScopeCustomer.body.meta.total).toBe(0);
  });

  it('paginates and sorts the case list by createdAt descending', async () => {
    const superAdmin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });
    const offeringId = await seedOffering(superAdmin.token);
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla-page@example.com', countryCode: 'MA' });

    const first = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId });

    const page1 = await request(app)
      .get('/api/v1/cases?limit=1')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(page1.body.meta.total).toBe(2);
    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.data[0].id).toBe(second.body.case.id);

    const page2 = await request(app)
      .get('/api/v1/cases?limit=1&page=2')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.data[0].id).toBe(first.body.case.id);
  });

  it('rejects invalid filter values with 400', async () => {
    const superAdmin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk@example.com');
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });
    const offeringId = await seedOffering(superAdmin.token);
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla-invalid@example.com', countryCode: 'MA' });
    await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId });

    const badStatus = await request(app)
      .get('/api/v1/cases?status=invalid')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(badStatus.status).toBe(400);

    const badCategory = await request(app)
      .get('/api/v1/cases?category=invalid')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(badCategory.status).toBe(400);

    const badCustomer = await request(app)
      .get('/api/v1/cases?customerId=not-an-object-id')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(badCustomer.status).toBe(400);
    expect(badCustomer.body.error.code).toBe('INVALID_CUSTOMER');
  });

  it('returns case detail with documents, quotation, and payment evidence', async () => {
    const superAdmin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk-detail@example.com');
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });

    const offeringId = await seedOffering(superAdmin.token);
    await request(app)
      .post('/api/v1/pricing-rules')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ amount: '250.50', currency: 'EUR' });

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla-detail@example.com', countryCode: 'MA' });

    const quoted = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId });

    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({
        customerId: customer.body.customer.id,
        offeringId,
        quotationId: quoted.body.quotation.id,
      });
    const caseId = opened.body.case.id as string;

    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n');
    await request(app)
      .post(`/api/v1/cases/${caseId}/documents`)
      .set('Authorization', `Bearer ${staff.token}`)
      .query({ kind: 'identity' })
      .attach('file', pdf, { filename: 'passport.pdf', contentType: 'application/pdf' });

    await request(app)
      .post(`/api/v1/quotations/${quoted.body.quotation.id}/payment-evidence`)
      .set('Authorization', `Bearer ${staff.token}`)
      .attach('file', pdf, { filename: 'receipt.pdf', contentType: 'application/pdf' });

    const detail = await request(app)
      .get(`/api/v1/cases/${caseId}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.case.id).toBe(caseId);
    expect(detail.body.documents).toHaveLength(1);
    expect(detail.body.documents[0].kind).toBe('identity');
    expect(detail.body.documents[0].originalFilename).toBe('passport.pdf');
    expect(detail.body.quotation).not.toBeNull();
    expect(detail.body.quotation.id).toBe(quoted.body.quotation.id);
    expect(detail.body.quotation.amount).toBe('250.50');
    expect(detail.body.paymentEvidence).toHaveLength(1);
    expect(detail.body.paymentEvidence[0].status).toBe('submitted');
    expect(detail.body.paymentEvidence[0].originalFilename).toBe('receipt.pdf');
  });

  it('returns null quotation and empty payment evidence when case has no quotation', async () => {
    const superAdmin = await bearerFor('super_admin', 'root@example.com');
    const staff = await bearerFor('staff', 'clerk-noquote@example.com');
    await request(app)
      .put('/api/v1/country-assignments')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });

    const offeringId = await seedOffering(superAdmin.token);
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ fullName: 'Layla', email: 'layla-noquote@example.com', countryCode: 'MA' });

    const opened = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ customerId: customer.body.customer.id, offeringId });

    const detail = await request(app)
      .get(`/api/v1/cases/${opened.body.case.id}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.documents).toEqual([]);
    expect(detail.body.quotation).toBeNull();
    expect(detail.body.paymentEvidence).toEqual([]);
  });
});
