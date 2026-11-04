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
  /** Stored media row backing the logo, or `null` when none is set. */
  logoMediaId: string | null;
  /** Resolved public URL of the provider's logo, or `null` when none is set (UI falls back to the brand mark). */
  logoUrl: string | null;
  /** Stored media row backing the cover photo, or `null` when none is set. */
  coverMediaId: string | null;
  /** Resolved public URL of the provider's cover photo, or `null` when none is set. */
  coverImageUrl: string | null;
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

/* ------------------------------------------------------------------ payments */

/**
 * How a customer sends the money. Every receiving rail in the world is a method
 * plus the identifiers that method is paid into: a bank transfer needs an IBAN or a
 * local account number, a wallet a phone number, a crypto rail an address and a
 * network — none of them is "a bank account with an IBAN" by definition.
 */
export const PAYMENT_METHODS = [
  'bank_transfer',
  'instant_payment',
  'mobile_money',
  'digital_wallet',
  'payment_gateway',
  'remittance_pickup',
  'crypto',
  'cash_office',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentMethodGroup = 'bank' | 'instant' | 'wallet' | 'gateway' | 'cash' | 'crypto';

/**
 * What an identifier holds. The type — not the rail — decides how the value is
 * normalized, validated, hinted in the UI and masked in the audit trail.
 */
export const PAYMENT_IDENTIFIER_TYPES = [
  'iban',
  'account_number',
  'bank_code',
  'swift_bic',
  'phone',
  'email',
  'handle',
  'url',
  'crypto_address',
  'text',
] as const;
export type PaymentIdentifierType = (typeof PAYMENT_IDENTIFIER_TYPES)[number];

export interface PaymentIdentifierField {
  /** Stable key, e.g. `iban` or `upiVpa`; also the i18n suffix `payments.fields.<key>`. */
  key: string;
  type: PaymentIdentifierType;
  required: boolean;
}

/**
 * A specific way of paying into a method: an IBAN transfer and a domestic-account
 * transfer are both `bank_transfer`, but they ask for different identifiers.
 */
export interface PaymentProfile {
  id: string;
  fields: PaymentIdentifierField[];
}

export interface PaymentMethodDefinition {
  id: PaymentMethod;
  group: PaymentMethodGroup;
  profiles: PaymentProfile[];
  /** Where the rail is normally used; empty means anywhere. Guidance, never enforcement. */
  countries: string[];
}

/**
 * The single source of truth for receiving rails: the API validates against it, the
 * admin form renders its fields, and the customer wizard labels them. Supporting a new
 * rail means adding one entry here — no schema, route or form change.
 */
export const PAYMENT_METHOD_LIBRARY: readonly PaymentMethodDefinition[] = [
  {
    id: 'bank_transfer',
    group: 'bank',
    countries: [],
    profiles: [
      {
        id: 'iban',
        fields: [
          { key: 'iban', type: 'iban', required: true },
          { key: 'swiftBic', type: 'swift_bic', required: false },
        ],
      },
      {
        id: 'local',
        fields: [
          { key: 'accountNumber', type: 'account_number', required: true },
          { key: 'bankCode', type: 'bank_code', required: true },
          { key: 'swiftBic', type: 'swift_bic', required: false },
          { key: 'branch', type: 'text', required: false },
        ],
      },
    ],
  },
  {
    id: 'instant_payment',
    group: 'instant',
    countries: ['IN', 'BR', 'CA', 'US'],
    profiles: [
      {
        id: 'upi',
        fields: [{ key: 'upiVpa', type: 'handle', required: true }],
      },
      {
        id: 'pix',
        fields: [{ key: 'pixKey', type: 'handle', required: true }],
      },
      {
        id: 'interac',
        fields: [{ key: 'email', type: 'email', required: true }],
      },
      {
        id: 'zelle',
        fields: [{ key: 'zelleHandle', type: 'handle', required: true }],
      },
    ],
  },
  {
    id: 'mobile_money',
    group: 'wallet',
    countries: [],
    profiles: [
      {
        id: 'phone',
        fields: [{ key: 'phone', type: 'phone', required: true }],
      },
    ],
  },
  {
    id: 'digital_wallet',
    group: 'wallet',
    countries: [],
    profiles: [
      {
        id: 'email',
        fields: [
          { key: 'email', type: 'email', required: true },
          { key: 'handle', type: 'handle', required: false },
        ],
      },
    ],
  },
  {
    id: 'payment_gateway',
    group: 'gateway',
    countries: [],
    profiles: [
      {
        id: 'link',
        fields: [
          { key: 'url', type: 'url', required: true },
          { key: 'merchantId', type: 'text', required: false },
        ],
      },
    ],
  },
  {
    id: 'remittance_pickup',
    group: 'cash',
    countries: [],
    profiles: [
      {
        id: 'agent',
        fields: [
          { key: 'city', type: 'text', required: true },
          { key: 'agentCode', type: 'text', required: false },
        ],
      },
    ],
  },
  {
    id: 'crypto',
    group: 'crypto',
    countries: [],
    profiles: [
      {
        id: 'address',
        fields: [
          { key: 'address', type: 'crypto_address', required: true },
          { key: 'network', type: 'text', required: true },
          { key: 'memo', type: 'text', required: false },
        ],
      },
    ],
  },
  {
    id: 'cash_office',
    group: 'cash',
    countries: [],
    profiles: [
      {
        id: 'office',
        fields: [
          { key: 'address', type: 'text', required: true },
          { key: 'contact', type: 'phone', required: false },
        ],
      },
    ],
  },
];

export function paymentMethodDefinition(method: PaymentMethod): PaymentMethodDefinition {
  const definition = PAYMENT_METHOD_LIBRARY.find((entry) => entry.id === method);
  if (!definition) {
    throw new Error(`Unknown payment method: ${method}`);
  }
  return definition;
}

/**
 * The profile of a method, or `null` when the method or the profile id is unknown —
 * a row written under an older rail still has to render instead of throwing.
 */
export function paymentMethodProfile(method: string, profileId: string): PaymentProfile | null {
  return (
    PAYMENT_METHOD_LIBRARY.find((entry) => entry.id === method)?.profiles.find(
      (entry) => entry.id === profileId,
    ) ?? null
  );
}

/** The profile used when the caller does not name one (the first one declared). */
export function defaultPaymentProfile(method: PaymentMethod): PaymentProfile {
  const [profile] = paymentMethodDefinition(method).profiles;
  if (!profile) {
    throw new Error(`Payment method ${method} declares no profile`);
  }
  return profile;
}

export interface PublicPaymentIdentifier {
  key: string;
  type: PaymentIdentifierType;
  value: string;
}

/**
 * One way for a customer to pay: a method, the profile of that method, and the
 * identifiers the money is sent to. `identifiers` holds only what the profile allows.
 */
export interface PublicPaymentAccount {
  id: string;
  customerCountryCode: string | null;
  currency: string;
  method: PaymentMethod;
  profile: string;
  label: string;
  beneficiaryName: string;
  /** The bank, mobile-money operator, wallet, exchange or desk the money lands in. */
  providerName: string;
  identifiers: PublicPaymentIdentifier[];
  referenceHint: string | null;
  notes: string | null;
  /** Lower sorts first when several rails serve one country and currency. */
  priority: number;
  isActive: boolean;
}

export const DOCUMENT_KINDS = ['identity', 'medical', 'supporting'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Admin verdict on a single upload; `pending` until someone looks at it. */
export const DOCUMENT_REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type DocumentReviewStatus = (typeof DOCUMENT_REVIEW_STATUSES)[number];

/**
 * A reusable entry in the Super Admin's document library. Services pick the ones
 * they require, so the same document is defined once and never retyped.
 */
export interface PublicDocumentRequirement {
  id: string;
  key: string;
  title: LocalizedText;
  description: LocalizedText | null;
  kind: DocumentKind;
  order: number;
  isActive: boolean;
}

export interface PublicCaseDocument {
  id: string;
  caseId: string;
  customerId: string;
  kind: DocumentKind;
  /** Library entry this upload satisfies, or `null` for a free-form upload. */
  requirementId: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** Admin verdict on this upload; `pending` until reviewed. */
  reviewStatus: DocumentReviewStatus;
  /** What the customer must fix when an admin rejects the upload, or `null`. */
  reviewNote: string | null;
  reviewedAt: string | null;
  /** The reviewer's display name (email as a fallback), or `null` while unreviewed. */
  reviewedByName: string | null;
  createdAt: string;
}

/** The required-document list frozen onto a case when it is opened. */
export interface CaseRequiredDocument {
  requirementId: string;
  key: string;
  title: LocalizedText;
  description: LocalizedText | null;
  kind: DocumentKind;
  order: number;
}

export const CASE_STATUSES = ['open', 'closed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/**
 * Admin decision on a submitted file, separate from the open/closed lifecycle:
 * `awaiting` until someone opens it, then `in_review`, and finally `accepted`
 * or `rejected`. A rejection sends the file back to the customer to fix.
 */
export const CASE_REVIEW_STATUSES = ['awaiting', 'in_review', 'accepted', 'rejected'] as const;
export type CaseReviewStatus = (typeof CASE_REVIEW_STATUSES)[number];

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
  /** The document checklist frozen onto the case when it was opened. */
  requiredDocuments: CaseRequiredDocument[];
  /**
   * The receiving rail the customer chose to pay through, or `null` while they have
   * not picked one yet.
   */
  paymentAccountId: string | null;
  paymentMethod: PaymentMethod | null;
  /**
   * When the customer handed the completed file over to an admin, or `null` while the
   * self-service application is still a draft (documents and receipt still missing).
   * Admin queues only ever show submitted cases.
   */
  submittedAt: string | null;
  /** Admin verdict on the whole file; `awaiting` until someone opens it. */
  reviewStatus: CaseReviewStatus;
  /** Admin explanation; required when the case is rejected. */
  reviewNote: string | null;
  reviewedAt: string | null;
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
  'case.created',
  'case.message_created',
  'case.workflow_stage_transitioned',
  'case.closed',
  'case.document_approved',
  'case.document_rejected',
  'case.document_reuploaded',
  'case.accepted',
  'case.rejected',
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
  /** The reviewer's display name (email as a fallback), or `null` while unreviewed. */
  reviewedByName: string | null;
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
  /** Localized package name; every locale is always present (unset locales are empty strings). */
  title: LocalizedText;
  /** Localized short summary; every locale is always present (unset locales are empty strings). */
  summary: LocalizedText;
  /** Localized requirements summary, or `null` when the package has none. */
  requirementsSummary: LocalizedText | null;
  /** Library documents a customer must provide for this package, in display order. */
  requiredDocumentIds: string[];
  category: ServiceCategory;
  /** Provider backing the offering, or `null` for a standalone offering with no partner. */
  providerId: string | null;
  cityId: string;
  countryCode: string;
  /** Stored media row backing the logo, or `null` when none is set. */
  logoMediaId: string | null;
  /** Resolved public URL of the package's logo, or `null` when none is set (UI falls back to the brand mark). */
  logoUrl: string | null;
  /** Stored media row backing the cover photo, or `null` when none is set. */
  coverMediaId: string | null;
  /** Resolved public URL of the package's cover photo, or `null` when none is set. */
  coverImageUrl: string | null;
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

export type LocalizedText = Record<AppLocale, string>;

export function emptyLocalizedText(): LocalizedText {
  return { en: '', tr: '', fr: '', ar: '' };
}

export const SHOWCASE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
export type ShowcaseImageMimeType = (typeof SHOWCASE_IMAGE_MIME_TYPES)[number];

export const SHOWCASE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export interface PublicMedia {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * One frame of a cinematic scene: a single photo plus the focal point (as percentages)
 * the camera should hold on. Frames inside a scene play as one continuous forward move.
 */
export interface PublicShowcaseFrame {
  mediaId: string | null;
  imageUrl: string | null;
  focalX: number;
  focalY: number;
}

/** Default focus for a frame that has no admin-chosen focal point. */
export const DEFAULT_FOCAL_POINT = 50;

/** Sanity guard for the API only — the engine itself never assumes a frame count. */
export const SHOWCASE_SCENE_MAX_FRAMES = 24;

/**
 * A cinematic scene for the scroll-controlled hero. Ordered within its category; a scene
 * owns an ordered list of frames (one or more), the copy shown over them and an optional
 * navigation `name` (progress-dot label). The call-to-action is derived from the category.
 */
export interface PublicShowcaseSlide {
  id: string;
  order: number;
  isActive: boolean;
  category: ServiceCategory | null;
  /** First frame's media id, kept as a convenience mirror of `frames[0]`. */
  mediaId: string | null;
  /** First frame's image URL, kept for existing banners that need a single image. */
  imageUrl: string | null;
  frames: PublicShowcaseFrame[];
  name: LocalizedText;
  eyebrow: LocalizedText;
  headline: LocalizedText;
  narrative: LocalizedText;
  altText: LocalizedText;
}

/** Pages whose copy is editable from the Super Admin site-content tab. */
export const PAGE_CONTENT_KEYS = ['faq', 'services', 'privacy', 'terms'] as const;
export type PageContentKey = (typeof PAGE_CONTENT_KEYS)[number];

/** Networks the site can link to. A closed list so every account has a matching glyph. */
export const SOCIAL_NETWORKS = [
  'instagram',
  'facebook',
  'x',
  'linkedin',
  'youtube',
  'tiktok',
  'whatsapp',
  'telegram',
  'snapchat',
  'pinterest',
  'reddit',
  'threads',
  'discord',
  'vimeo',
  'github',
  'email',
  'website',
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** Display names for the network list. Brand names read the same in every language. */
export const SOCIAL_NETWORK_LABELS: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  snapchat: 'Snapchat',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  threads: 'Threads',
  discord: 'Discord',
  vimeo: 'Vimeo',
  github: 'GitHub',
  email: 'Email',
  website: 'Website',
};

/** A social account the footer and contact page link to. */
export interface PublicSocialAccount {
  id: string;
  network: SocialNetwork;
  url: string;
  order: number;
  isActive: boolean;
}

export interface PublicPageSection {
  id: string;
  title: LocalizedText;
  body: LocalizedText;
}

export interface PublicPageContent {
  key: PageContentKey;
  isActive: boolean;
  eyebrow: LocalizedText;
  title: LocalizedText;
  lead: LocalizedText;
  updated: string;
  sections: PublicPageSection[];
}

/** Everything a Super Admin owns on the public site, in one payload. */
export interface PublicSiteContent {
  social: PublicSocialAccount[];
  pages: PublicPageContent[];
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
  firstName: string | null;
  lastName: string | null;
  /** Stored media row backing the profile photo, or `null` when none is set. */
  avatarMediaId: string | null;
  /** Resolved public URL of the profile photo, or `null` (UI falls back to initials). */
  avatarUrl: string | null;
  /** True once the email address has been proven with a verification code. */
  emailVerified: boolean;
  isActive: boolean;
  /** ISO 3166-1 alpha-2 country of residence, or `null` when the account never set one. */
  countryCode: string | null;
  customerId: string | null;
}

export type AssignmentStatus = 'unassigned' | 'assigned' | 'exception';

/**
 * Office flow: an admin opens a login account for a walk-in customer before the customer ever
 * signs up. `none` means no account exists, `unclaimed` a provisioned account whose password
 * has not been set yet, and `active` a claimed account the customer can sign in with.
 */
export type CustomerAccountStatus = 'none' | 'unclaimed' | 'active';

export interface PublicCustomer {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  countryCode: string;
  assignedManagerUserId: string | null;
  /**
   * The assigned manager's name (email as a fallback), resolved only by the customer detail
   * endpoint; list responses leave it undefined so they stay a single query.
   */
  assignedManagerName?: string | null;
  /** Whether this customer already has a login account; detail endpoint only. */
  accountStatus?: CustomerAccountStatus;
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
