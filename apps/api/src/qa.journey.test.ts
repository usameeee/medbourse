import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { UserRole } from '@medbourse/shared';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { signAccessToken } from './auth/tokens.js';
import { AuditLog } from './models/AuditLog.js';
import { Case } from './models/Case.js';
import { CaseDocument } from './models/CaseDocument.js';
import { City } from './models/City.js';
import { CountryAssignment } from './models/CountryAssignment.js';
import { Customer } from './models/Customer.js';
import { Invitation } from './models/Invitation.js';
import { Message } from './models/Message.js';
import { Notification } from './models/Notification.js';
import { Offering } from './models/Offering.js';
import { PaymentAccount } from './models/PaymentAccount.js';
import { PaymentEvidence } from './models/PaymentEvidence.js';
import { PricingRule } from './models/PricingRule.js';
import { Provider } from './models/Provider.js';
import { Quotation } from './models/Quotation.js';
import { User } from './models/User.js';
import { WorkflowTemplate, WorkflowTemplateVersion } from './models/WorkflowTemplate.js';

const app = createApp();
const password = 'correcthorse';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n');

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function bearerFor(role: UserRole, email: string) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role,
  });
  return { token: signAccessToken(user._id.toString(), user.role), user };
}

/**
 * P9-T01 — the master-spec golden path, exercised end-to-end through the real API.
 * Seams covered: catalog → pricing → payment account → workflow template → country
 * assignment → customer + invitation → self-registration → quotation snapshot →
 * case (workflow version snapshot) → document upload → payment evidence → messaging
 * → evidence review → workflow transitions → close → audit trail.
 */
describe('critical journey (QA)', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterEach(async () => {
    await AuditLog.deleteMany({});
    await Notification.deleteMany({});
    await Message.deleteMany({});
    await PaymentEvidence.deleteMany({});
    await CaseDocument.deleteMany({});
    await Case.deleteMany({});
    await Quotation.deleteMany({});
    await PricingRule.deleteMany({});
    await PaymentAccount.deleteMany({});
    await WorkflowTemplateVersion.deleteMany({});
    await WorkflowTemplate.deleteMany({});
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

  it(
    'runs a customer from configuration to a closed case with a complete audit trail',
    async () => {
      // --- super_admin configures the platform ---------------------------------
      const admin = await bearerFor('super_admin', 'owner@example.com');
      const staff = await bearerFor('staff', 'operator@example.com');

      const city = await request(app)
        .post('/api/v1/catalog/cities')
        .set(auth(admin.token))
        .send({ slug: 'istanbul', name: 'Istanbul', countryCode: 'TR' });
      expect(city.status).toBe(201);
      const provider = await request(app)
        .post('/api/v1/catalog/providers')
        .set(auth(admin.token))
        .send({ name: 'Admissions Desk', category: 'education', cityId: city.body.city.id });
      expect(provider.status).toBe(201);
      const offering = await request(app)
        .post('/api/v1/catalog/offerings')
        .set(auth(admin.token))
        .send({
          slug: 'admission-support',
          title: 'Admission support',
          summary: 'Document coordination for university applications.',
          providerId: provider.body.provider.id,
        });
      expect(offering.status).toBe(201);
      expect(offering.body.offering.category).toBe('education');
      const offeringId = offering.body.offering.id as string;

      const rule = await request(app)
        .post('/api/v1/pricing-rules')
        .set(auth(admin.token))
        .send({ amount: '1250.00', currency: 'EUR' });
      expect(rule.status).toBe(201);

      const account = await request(app)
        .post('/api/v1/payment-accounts')
        .set(auth(admin.token))
        .send({
          currency: 'EUR',
          label: 'Main EUR account',
          beneficiaryName: 'Medbourse',
          bankName: 'Example Bank',
          iban: 'DE89370400440532013000',
        });
      expect(account.status).toBe(201);

      const template = await request(app)
        .post('/api/v1/workflow-templates')
        .set(auth(admin.token))
        .send({
          name: 'Education standard',
          category: 'education',
          stages: [
            { id: 'documents', name: 'Documents', order: 0 },
            { id: 'review', name: 'Review', order: 1 },
            { id: 'welcome', name: 'Welcome call', order: 2, optional: true },
          ],
        });
      expect(template.status).toBe(201);
      expect(template.body.version.versionNumber).toBe(1);

      const assignment = await request(app)
        .put('/api/v1/country-assignments')
        .set(auth(admin.token))
        .send({ countryCode: 'MA', managerUserIds: [staff.user._id.toString()] });
      expect(assignment.status).toBe(201);

      // --- staff onboards the customer ----------------------------------------
      const customer = await request(app)
        .post('/api/v1/customers')
        .set(auth(staff.token))
        .send({ fullName: 'Layla', email: 'layla@example.com', countryCode: 'MA' });
      expect(customer.status).toBe(201);
      expect(customer.body.customer.assignmentStatus).toBe('assigned');
      expect(customer.body.customer.assignedManagerUserId).toBe(staff.user._id.toString());
      const customerId = customer.body.customer.id as string;

      const invited = await request(app)
        .post(`/api/v1/customers/${customerId}/invitations`)
        .set(auth(staff.token))
        .send({});
      expect(invited.status).toBe(201);
      expect(typeof invited.body.token).toBe('string');

      const quoted = await request(app)
        .post('/api/v1/quotations')
        .set(auth(staff.token))
        .send({ customerId, offeringId });
      expect(quoted.status).toBe(201);
      expect(quoted.body.quotation.amount).toBe('1250.00');
      expect(quoted.body.quotation.currency).toBe('EUR');
      expect(quoted.body.quotation.snapshot.offeringTitle).toBe('Admission support');
      expect(quoted.body.quotation.snapshot.customerCountryCode).toBe('MA');
      const quotationId = quoted.body.quotation.id as string;

      const opened = await request(app)
        .post('/api/v1/cases')
        .set(auth(staff.token))
        .send({ customerId, offeringId, quotationId });
      expect(opened.status).toBe(201);
      expect(opened.body.case.status).toBe('open');
      expect(opened.body.case.quotationId).toBe(quotationId);
      expect(opened.body.case.workflow.versionNumber).toBe(1);
      expect(opened.body.case.workflow.stages.map((s: { id: string }) => s.id)).toEqual([
        'documents',
        'review',
        'welcome',
      ]);
      expect(
        opened.body.case.workflow.stages.every((s: { status: string }) => s.status === 'pending'),
      ).toBe(true);
      const caseId = opened.body.case.id as string;

      // The quotation keeps its frozen snapshot even after the offering changes.
      await request(app)
        .patch(`/api/v1/catalog/offerings/${offeringId}`)
        .set(auth(admin.token))
        .send({ title: 'Renamed offering' });
      const quotedAfterRename = await request(app)
        .get(`/api/v1/quotations/${quotationId}`)
        .set(auth(staff.token));
      expect(quotedAfterRename.body.quotation.snapshot.offeringTitle).toBe('Admission support');
      expect(quotedAfterRename.body.quotation.amount).toBe('1250.00');

      // --- customer self-registers through the invitation ----------------------
      const linked = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'layla@example.com', password, invitationToken: invited.body.token });
      expect(linked.status).toBe(201);
      expect(linked.body.user.customerId).toBe(customerId);
      const customerToken = signAccessToken(linked.body.user.id, 'customer');

      // --- customer submits a document, sees payment instructions, pays --------
      const document = await request(app)
        .post(`/api/v1/cases/${caseId}/documents`)
        .set(auth(customerToken))
        .query({ kind: 'identity' })
        .attach('file', pdf, { filename: 'passport.pdf', contentType: 'application/pdf' });
      expect(document.status).toBe(201);
      expect(document.body.document.kind).toBe('identity');

      const instructions = await request(app)
        .get(`/api/v1/quotations/${quotationId}/payment-instructions`)
        .set(auth(customerToken));
      expect(instructions.status).toBe(200);
      expect(instructions.body.amount).toBe('1250.00');
      expect(instructions.body.paymentAccount.iban).toBe('DE89370400440532013000');

      const evidence = await request(app)
        .post(`/api/v1/quotations/${quotationId}/payment-evidence`)
        .set(auth(customerToken))
        .attach('file', pdf, { filename: 'receipt.pdf', contentType: 'application/pdf' });
      expect(evidence.status).toBe(201);
      // A receipt is evidence for review — never automatic approval.
      expect(evidence.body.evidence.status).toBe('submitted');
      const evidenceId = evidence.body.evidence.id as string;

      const staffAfterPay = await request(app)
        .get('/api/v1/notifications')
        .set(auth(staff.token));
      expect(
        staffAfterPay.body.data.some(
          (n: { type: string }) => n.type === 'payment_evidence.submitted',
        ),
      ).toBe(true);

      // --- messaging: staff is notified, the actor is excluded -----------------
      const message = await request(app)
        .post(`/api/v1/cases/${caseId}/messages`)
        .set(auth(customerToken))
        .send({ body: 'Passport uploaded — please review.' });
      expect(message.status).toBe(201);

      const staffAfterMessage = await request(app)
        .get('/api/v1/notifications')
        .set(auth(staff.token));
      expect(
        staffAfterMessage.body.data.some(
          (n: { type: string }) => n.type === 'case.message_created',
        ),
      ).toBe(true);

      const customerNotifs = await request(app)
        .get('/api/v1/notifications')
        .set(auth(customerToken));
      expect(
        customerNotifs.body.data.some(
          (n: { type: string }) => n.type === 'case.message_created',
        ),
      ).toBe(false);

      // --- workflow is enforced server-side -----------------------------------
      const prematureClose = await request(app)
        .patch(`/api/v1/cases/${caseId}/close`)
        .set(auth(staff.token));
      expect(prematureClose.status).toBe(409);
      expect(prematureClose.body.error.code).toBe('REQUIRED_STAGES_NOT_DONE');

      const outOfOrder = await request(app)
        .patch(`/api/v1/cases/${caseId}/workflow/stages/review`)
        .set(auth(staff.token))
        .send({ status: 'done' });
      expect(outOfOrder.status).toBe(409);
      expect(outOfOrder.body.error.code).toBe('PREREQUISITE_NOT_DONE');

      const documentsDone = await request(app)
        .patch(`/api/v1/cases/${caseId}/workflow/stages/documents`)
        .set(auth(staff.token))
        .send({ status: 'done' });
      expect(documentsDone.status).toBe(200);

      const reviewDone = await request(app)
        .patch(`/api/v1/cases/${caseId}/workflow/stages/review`)
        .set(auth(staff.token))
        .send({ status: 'done' });
      expect(reviewDone.status).toBe(200);

      const skipped = await request(app)
        .patch(`/api/v1/cases/${caseId}/workflow/stages/welcome`)
        .set(auth(staff.token))
        .send({ status: 'skipped' });
      expect(skipped.status).toBe(200);

      // --- staff reviews the receipt ------------------------------------------
      const reviewed = await request(app)
        .post(`/api/v1/payment-evidence/${evidenceId}/review`)
        .set(auth(staff.token))
        .send({ decision: 'approved' });
      expect(reviewed.status).toBe(200);
      expect(reviewed.body.evidence.status).toBe('approved');

      const customerAfterReview = await request(app)
        .get('/api/v1/notifications')
        .set(auth(customerToken));
      expect(
        customerAfterReview.body.data.some(
          (n: { type: string }) => n.type === 'payment_evidence.approved',
        ),
      ).toBe(true);

      const reReview = await request(app)
        .post(`/api/v1/payment-evidence/${evidenceId}/review`)
        .set(auth(staff.token))
        .send({ decision: 'approved' });
      expect(reReview.status).toBe(409);
      expect(reReview.body.error.code).toBe('ALREADY_REVIEWED');

      // --- close and verify the customer's final view --------------------------
      const closed = await request(app)
        .patch(`/api/v1/cases/${caseId}/close`)
        .set(auth(staff.token));
      expect(closed.status).toBe(200);
      expect(closed.body.case.status).toBe('closed');

      const detail = await request(app)
        .get(`/api/v1/cases/${caseId}`)
        .set(auth(customerToken));
      expect(detail.status).toBe(200);
      expect(detail.body.case.status).toBe('closed');
      expect(detail.body.documents).toHaveLength(1);
      expect(detail.body.quotation.amount).toBe('1250.00');
      expect(detail.body.paymentEvidence).toHaveLength(1);
      expect(detail.body.paymentEvidence[0].status).toBe('approved');

      // --- the audit trail records the whole journey ---------------------------
      const audit = await request(app)
        .get('/api/v1/audit?entityType=Case&limit=100')
        .set(auth(admin.token));
      expect(audit.status).toBe(200);
      const actions = audit.body.data.map((entry: { action: string }) => entry.action);
      expect(actions).toContain('case.created');
      expect(actions).toContain('case.workflow_stage_transitioned');
      expect(actions).toContain('case.closed');
    },
    30_000,
  );
});
