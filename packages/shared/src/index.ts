import type { UserRole } from './roles.js';

export const API_VERSION = 'v1' as const;

export type { UserRole } from './roles.js';
export { USER_ROLES } from './roles.js';

export type ServiceCategory = 'education' | 'medical' | 'tourism';

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'education',
  'medical',
  'tourism',
] as const;

export interface PublicCity {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  isActive: boolean;
}

export interface PublicProvider {
  id: string;
  name: string;
  category: ServiceCategory;
  cityId: string;
  countryCode: string;
  website: string | null;
  isActive: boolean;
  partnershipVerified: boolean;
}

export const OFFERING_DISCLAIMERS: Record<ServiceCategory, string> = {
  education:
    'Coordination support only. MEDBOURSE does not guarantee university admission or a visa.',
  medical:
    'Coordination support only. MEDBOURSE does not provide clinical care or guarantee medical outcomes.',
  tourism: 'Coordination support only. Itineraries and availability can change.',
};

export interface Money {
  amount: string;
  currency: string;
}

export interface PublicPricingRule {
  id: string;
  customerCountryCode: string | null;
  category: ServiceCategory | null;
  offeringId: string | null;
  amount: string;
  currency: string;
  isActive: boolean;
}

export const PAYMENT_METHODS = ['bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PublicPaymentAccount {
  id: string;
  customerCountryCode: string | null;
  currency: string;
  method: PaymentMethod;
  label: string;
  beneficiaryName: string;
  bankName: string;
  iban: string;
  swiftBic: string | null;
  referenceHint: string | null;
  notes: string | null;
  isActive: boolean;
}

export const DOCUMENT_KINDS = ['identity', 'medical', 'supporting'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface PublicCaseDocument {
  id: string;
  caseId: string;
  customerId: string;
  kind: DocumentKind;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const CASE_STATUSES = ['open', 'closed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export interface WorkflowStageDefinition {
  id: string;
  name: string;
  description: string | null;
  order: number;
  optional: boolean;
}

export const WORKFLOW_STAGE_STATUSES = ['pending', 'in_progress', 'done', 'skipped'] as const;
export type WorkflowStageStatus = (typeof WORKFLOW_STAGE_STATUSES)[number];

export interface CaseWorkflowStage extends WorkflowStageDefinition {
  status: WorkflowStageStatus;
}

export interface CaseWorkflowSnapshot {
  templateId: string;
  versionNumber: number;
  stages: CaseWorkflowStage[];
}

export interface PublicWorkflowTemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  stages: WorkflowStageDefinition[];
  createdByUserId: string;
  createdAt: string;
}

export interface PublicWorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  category: ServiceCategory;
  isActive: boolean;
  currentVersionNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCase {
  id: string;
  customerId: string;
  offeringId: string;
  quotationId: string | null;
  status: CaseStatus;
  category: ServiceCategory;
  offeringTitle: string;
  workflow: CaseWorkflowSnapshot | null;
  createdAt: string;
}

export interface PublicMessage {
  id: string;
  caseId: string;
  authorUserId: string;
  authorRole: UserRole;
  body: string;
  createdAt: string;
}

export const NOTIFICATION_TYPES = [
  'case.message_created',
  'case.workflow_stage_transitioned',
  'case.closed',
  'payment_evidence.submitted',
  'payment_evidence.approved',
  'payment_evidence.rejected',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface PublicNotification {
  id: string;
  type: NotificationType;
  caseId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export const PAYMENT_EVIDENCE_STATUSES = ['submitted', 'approved', 'rejected'] as const;
export type PaymentEvidenceStatus = (typeof PAYMENT_EVIDENCE_STATUSES)[number];

export interface PublicPaymentEvidence {
  id: string;
  quotationId: string;
  customerId: string;
  status: PaymentEvidenceStatus;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PublicQuotation {
  id: string;
  customerId: string;
  offeringId: string;
  amount: string;
  currency: string;
  pricingRuleId: string;
  snapshot: {
    offeringTitle: string;
    offeringSlug: string;
    category: ServiceCategory;
    disclaimer: string;
    customerCountryCode: string;
  };
  issuedAt: string;
}

export interface PublicAuditLog {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PublicOffering {
  id: string;
  slug: string;
  title: string;
  summary: string;
  requirementsSummary: string | null;
  category: ServiceCategory;
  providerId: string;
  cityId: string;
  countryCode: string;
  isActive: boolean;
  disclaimer: string;
}

export const APP_LOCALES = ['en', 'tr', 'fr', 'ar'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const RTL_LOCALES: readonly AppLocale[] = ['ar'];

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}

export function resolveAppLocale(value: string | undefined): AppLocale {
  if (!value) {
    return 'en';
  }
  if (isAppLocale(value)) {
    return value;
  }
  const base = value.toLowerCase().split('-')[0] ?? '';
  return isAppLocale(base) ? base : 'en';
}

export function localeDirection(locale: AppLocale): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
  database: 'connected' | 'disconnected';
}

export type { Permission } from './permissions.js';
export { ROLE_PERMISSIONS, roleHasPermission } from './permissions.js';

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  customerId: string | null;
}

export type AssignmentStatus = 'unassigned' | 'assigned' | 'exception';

export interface PublicCustomer {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  countryCode: string;
  assignedManagerUserId: string | null;
  assignmentStatus: AssignmentStatus;
  createdByUserId: string | null;
  createdAt: string;
}

export interface PublicInvitation {
  id: string;
  customerId: string;
  email: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface PublicCountryAssignment {
  id: string;
  countryCode: string;
  managerUserIds: string[];
  isActive: boolean;
}

export interface AuthSessionResponse {
  user: PublicUser;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
