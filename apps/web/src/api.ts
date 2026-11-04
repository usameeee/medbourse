import type {
  AuthSessionResponse,
  DocumentKind,
  LocalizedText,
  PageContentKey,
  PaymentMethod,
  PublicAuditLog,
  PublicCase,
  PublicCaseDocument,
  PublicCity,
  PublicCountryAssignment,
  PublicCustomer,
  PublicDocumentRequirement,
  PublicInvitation,
  PublicMedia,
  PublicMessage,
  PublicNotification,
  PublicOffering,
  PublicPaymentAccount,
  PublicPaymentEvidence,
  PublicPricingRule,
  PublicProvider,
  PublicQuotation,
  PublicShowcaseFrame,
  PublicShowcaseSlide,
  PublicSiteContent,
  PublicUser,
  ServiceCategory,
  SocialNetwork,
  UserRole,
} from '@medbourse/shared';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export function apiUrl(path: string): string {
  return `${apiBase}${path}`;
}

/**
 * Turns a signed-URL payload into something an `<img>`/`<iframe>` can load. Cloudinary hands
 * back an absolute URL; the self-hosted driver returns an API path, which must be resolved
 * against the API origin (not the web app's) so the browser does not prefix the wrong host.
 */
export function resolveAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return new URL(url, apiBase).href;
}

async function parseErrorBody(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } };
    if (body.error?.message) {
      return { message: body.error.message, code: body.error.code };
    }
  } catch {
    /* non-JSON */
  }
  return { message: `HTTP ${res.status}` };
}

export async function parseApiError(res: Response): Promise<string> {
  return (await parseErrorBody(res)).message;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export interface ApiError extends Error {
  status: number;
  code?: string;
}

/** Paths that must never trigger a refresh-and-retry (they either issue or clear the session). */
const NO_REFRESH_PATHS = new Set([
  '/auth/login',
  '/auth/signup/request',
  '/auth/signup/verify',
  '/auth/invitations/claim',
  '/auth/password/forgot',
  '/auth/password/reset',
  '/auth/refresh',
]);

let refreshInFlight: Promise<boolean> | null = null;

let sessionExpiredHandler: (() => void) | null = null;

/** The app registers here so an unrecoverable session can drop the stale user and show sign-in. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share a
 * single in-flight request so a burst of 401s does not rotate the token repeatedly.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Resolves the signed-in user, transparently refreshing an expired access token. */
export function getCurrentUser(): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('/auth/me');
}

async function request<T>(path: string, init?: RequestInit, allowRefresh = true): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 401 && allowRefresh && !NO_REFRESH_PATHS.has(path)) {
    if (await refreshSession()) {
      return request<T>(path, init, false);
    }
    // The session cannot be recovered (refresh cookie gone or revoked); let the app
    // drop the stale user so the sign-in dialog is shown again instead of empty lists.
    sessionExpiredHandler?.();
  }
  if (!res.ok) {
    const { message, code } = await parseErrorBody(res);
    const err = new Error(message) as ApiError;
    err.status = res.status;
    err.code = code;
    throw err;
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface CaseListQuery {
  page?: number;
  limit?: number;
  status?: 'open' | 'closed';
  category?: 'education' | 'medical' | 'tourism';
  customerId?: string;
}

export function listCases(query: CaseListQuery = {}): Promise<Paginated<PublicCase>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.status) params.set('status', query.status);
  if (query.category) params.set('category', query.category);
  if (query.customerId) params.set('customerId', query.customerId);
  const qs = params.toString();
  return request<Paginated<PublicCase>>(`/cases${qs ? `?${qs}` : ''}`);
}

export interface CaseDetail {
  case: PublicCase;
  documents: PublicCaseDocument[];
  quotation: PublicQuotation | null;
  paymentEvidence: PublicPaymentEvidence[];
}

export function getCase(id: string): Promise<CaseDetail> {
  return request<CaseDetail>(`/cases/${id}`);
}

export interface ApplyForCaseInput {
  offeringId: string;
  countryCode: string;
  phone?: string;
  message?: string;
}

/** Opens a case from the customer's own account (self-service intake). */
export function applyForCase(input: ApplyForCaseInput): Promise<{ case: PublicCase }> {
  return request<{ case: PublicCase }>('/cases/apply', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Admin: opens a case on the customer's behalf (the office flow hands it over immediately). */
export function createCaseForCustomer(input: {
  customerId: string;
  offeringId: string;
}): Promise<{ case: PublicCase }> {
  return request<{ case: PublicCase }>('/cases', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Hands a finished draft application over to the admin. The server refuses until every
 * required document and the payment receipt are attached.
 */
export function submitCaseApplication(caseId: string): Promise<{ case: PublicCase }> {
  return request<{ case: PublicCase }>(`/cases/${caseId}/submit`, { method: 'POST' });
}

export interface PaymentInstructions {
  quotationId: string;
  amount: string;
  currency: string;
  /** Every rail this quotation can be paid through, best first; the customer picks one. */
  paymentAccounts: PublicPaymentAccount[];
}

/** The amount, currency, and receiving rails for a quotation (owner or admin). */
export function getPaymentInstructions(quotationId: string): Promise<PaymentInstructions> {
  return request<PaymentInstructions>(`/quotations/${quotationId}/payment-instructions`);
}

/** Records the receiving rail the customer pays through; `null` clears the choice. */
export function setCasePaymentAccount(
  caseId: string,
  paymentAccountId: string | null,
): Promise<{ case: PublicCase }> {
  return request<{ case: PublicCase }>(`/cases/${caseId}/payment-account`, {
    method: 'PATCH',
    body: JSON.stringify({ paymentAccountId }),
  });
}

/** Uploads the bank transfer receipt that proves the quotation was paid. */
export function uploadPaymentEvidence(
  quotationId: string,
  file: File,
): Promise<{ evidence: PublicPaymentEvidence; quotation: PublicQuotation }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ evidence: PublicPaymentEvidence; quotation: PublicQuotation }>(
    `/quotations/${quotationId}/payment-evidence`,
    { method: 'POST', body: form, headers: {} },
  );
}

export interface CustomerListQuery {
  page?: number;
  limit?: number;
  q?: string;
}

export function listCustomers(query: CustomerListQuery = {}): Promise<Paginated<PublicCustomer>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.q) params.set('q', query.q);
  const qs = params.toString();
  return request<Paginated<PublicCustomer>>(`/customers${qs ? `?${qs}` : ''}`);
}

export interface CustomerInput {
  fullName: string;
  email?: string;
  phone?: string;
  countryCode: string;
}

export function createCustomer(input: CustomerInput): Promise<{ customer: PublicCustomer }> {
  return request<{ customer: PublicCustomer }>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** One customer with its assignment resolved; used by the customer detail page. */
export function getCustomer(customerId: string): Promise<{ customer: PublicCustomer }> {
  return request<{ customer: PublicCustomer }>(`/customers/${customerId}`);
}

export function inviteCustomer(
  customerId: string,
  email?: string,
): Promise<{ invitation: PublicInvitation; token: string }> {
  return request<{ invitation: PublicInvitation; token: string }>(
    `/customers/${customerId}/invitations`,
    {
      method: 'POST',
      body: JSON.stringify(email ? { email } : {}),
    },
  );
}

/**
 * Office flow: opens a password-less login account for a walk-in customer. The customer claims
 * it later from the invitation link and sets their own password.
 */
export function provisionCustomerAccount(customerId: string): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>(`/customers/${customerId}/account`, { method: 'POST' });
}

export function reassignCustomer(
  customerId: string,
  managerUserId: string,
  reason: string,
): Promise<{ customer: PublicCustomer }> {
  return request<{ customer: PublicCustomer }>(`/customers/${customerId}/assignment`, {
    method: 'POST',
    body: JSON.stringify({ managerUserId, reason }),
  });
}

/** Active accounts that may manage customers (admin/super_admin). Admin-only endpoint. */
export function listManagers(): Promise<{ data: PublicUser[] }> {
  return request<{ data: PublicUser[] }>('/users/managers');
}

export function listOfferings(params: {
  category?: ServiceCategory;
  includeInactive?: boolean;
} = {}): Promise<{ data: PublicOffering[] }> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.includeInactive) qs.set('includeInactive', 'true');
  const query = qs.toString();
  return request<{ data: PublicOffering[] }>(`/catalog/offerings${query ? `?${query}` : ''}`);
}

export interface CityInput {
  slug: string;
  name: string;
  countryCode: string;
  isActive?: boolean;
}

export function listCities(
  params: { includeInactive?: boolean } = {},
): Promise<{ data: PublicCity[] }> {
  const qs = new URLSearchParams();
  if (params.includeInactive) qs.set('includeInactive', 'true');
  const query = qs.toString();
  return request<{ data: PublicCity[] }>(`/catalog/cities${query ? `?${query}` : ''}`);
}

export function createCity(input: CityInput): Promise<{ city: PublicCity }> {
  return request<{ city: PublicCity }>('/catalog/cities', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCity(id: string, input: Partial<CityInput>): Promise<{ city: PublicCity }> {
  return request<{ city: PublicCity }>(`/catalog/cities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export interface ProviderInput {
  name: string;
  category: ServiceCategory;
  cityId: string;
  website?: string;
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  isActive?: boolean;
  partnershipVerified?: boolean;
}

export function listProviders(
  params: { category?: ServiceCategory; includeInactive?: boolean } = {},
): Promise<{ data: PublicProvider[] }> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.includeInactive) qs.set('includeInactive', 'true');
  const query = qs.toString();
  return request<{ data: PublicProvider[] }>(`/catalog/providers${query ? `?${query}` : ''}`);
}

export function createProvider(input: ProviderInput): Promise<{ provider: PublicProvider }> {
  return request<{ provider: PublicProvider }>('/catalog/providers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProvider(
  id: string,
  input: Partial<ProviderInput>,
): Promise<{ provider: PublicProvider }> {
  return request<{ provider: PublicProvider }>(`/catalog/providers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export interface OfferingInput {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  requirementsSummary?: LocalizedText | null;
  /** Library documents the customer must provide for this package, in display order. */
  requiredDocumentIds?: string[];
  /** Partner provider, or `null` for a standalone offering that has no partner. */
  providerId: string | null;
  /** Required for a standalone offering (no provider); derived from the provider otherwise. */
  category?: ServiceCategory;
  cityId?: string;
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  isActive?: boolean;
}

export function createOffering(input: OfferingInput): Promise<{ offering: PublicOffering }> {
  return request<{ offering: PublicOffering }>('/catalog/offerings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateOffering(
  id: string,
  input: Partial<OfferingInput>,
): Promise<{ offering: PublicOffering }> {
  return request<{ offering: PublicOffering }>(`/catalog/offerings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export interface AuditListQuery {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  /** Narrows to one record, e.g. a customer's own history. */
  entityId?: string;
  actorUserId?: string;
}

export function listAuditLogs(query: AuditListQuery = {}): Promise<Paginated<PublicAuditLog>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.action) params.set('action', query.action);
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.entityId) params.set('entityId', query.entityId);
  if (query.actorUserId) params.set('actorUserId', query.actorUserId);
  const qs = params.toString();
  return request<Paginated<PublicAuditLog>>(`/audit${qs ? `?${qs}` : ''}`);
}

export function listCaseMessages(caseId: string): Promise<{ data: PublicMessage[] }> {
  return request<{ data: PublicMessage[] }>(`/cases/${caseId}/messages`);
}

export function createCaseMessage(
  caseId: string,
  body: string,
): Promise<{ message: PublicMessage }> {
  return request<{ message: PublicMessage }>(`/cases/${caseId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface PaginatedNotifications {
  data: PublicNotification[];
  meta: { page: number; limit: number; total: number; unread: number };
}

export function listNotifications(
  query: NotificationListQuery = {},
): Promise<PaginatedNotifications> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.unreadOnly) params.set('unreadOnly', 'true');
  const qs = params.toString();
  return request<PaginatedNotifications>(`/notifications${qs ? `?${qs}` : ''}`);
}

export function markNotificationRead(id: string): Promise<{ notification: PublicNotification }> {
  return request<{ notification: PublicNotification }>(`/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return request<{ updated: number }>('/notifications/read-all', { method: 'POST' });
}

/** Public, unauthenticated: active slides in display order. */
export function listShowcase(): Promise<{ data: PublicShowcaseSlide[] }> {
  return request<{ data: PublicShowcaseSlide[] }>('/showcase');
}

/** Super Admin: every slide, including inactive ones. */
export function listAllShowcase(): Promise<{ data: PublicShowcaseSlide[] }> {
  return request<{ data: PublicShowcaseSlide[] }>('/showcase/all');
}

export interface ShowcaseSlideInput {
  mediaId?: string | null;
  /** Ordered scene frames: media id plus an optional focal point; the API resolves the URLs. */
  frames?: Array<Pick<PublicShowcaseFrame, 'mediaId'> & Partial<Pick<PublicShowcaseFrame, 'focalX' | 'focalY'>>>;
  category?: ServiceCategory | null;
  order?: number;
  isActive?: boolean;
  name?: LocalizedText;
  eyebrow: LocalizedText;
  headline: LocalizedText;
  narrative: LocalizedText;
  altText: LocalizedText;
}

export function createShowcaseSlide(
  input: ShowcaseSlideInput,
): Promise<{ slide: PublicShowcaseSlide }> {
  return request<{ slide: PublicShowcaseSlide }>('/showcase', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateShowcaseSlide(
  id: string,
  input: Partial<ShowcaseSlideInput>,
): Promise<{ slide: PublicShowcaseSlide }> {
  return request<{ slide: PublicShowcaseSlide }>(`/showcase/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteShowcaseSlide(id: string): Promise<void> {
  return request<void>(`/showcase/${id}`, { method: 'DELETE' });
}

/** Super Admin: upload a public marketing image (multipart). */
export function uploadMedia(file: File): Promise<{ media: PublicMedia }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ media: PublicMedia }>('/media', {
    method: 'POST',
    body: form,
    headers: {},
  });
}

/** Public, unauthenticated: the active social accounts and page copy. */
export function getSiteContent(): Promise<PublicSiteContent> {
  return request<PublicSiteContent>('/site-content');
}

/** Super Admin: every entry, including inactive ones, for editing. */
export function getSiteContentAll(): Promise<PublicSiteContent> {
  return request<PublicSiteContent>('/site-content/all');
}

export interface SiteSocialInput {
  id?: string;
  network: SocialNetwork;
  url: string;
  order?: number;
  isActive?: boolean;
}

export interface SitePageSectionInput {
  id?: string;
  title: LocalizedText;
  body: LocalizedText;
}

export interface SitePageInput {
  key: PageContentKey;
  isActive?: boolean;
  eyebrow?: LocalizedText;
  title?: LocalizedText;
  lead?: LocalizedText;
  updated?: string;
  sections?: SitePageSectionInput[];
}

export interface SiteContentInput {
  social?: SiteSocialInput[];
  pages?: SitePageInput[];
}

/** Super Admin: replaces social wholesale and merges pages by key. */
export function updateSiteContent(input: SiteContentInput): Promise<PublicSiteContent> {
  return request<PublicSiteContent>('/site-content', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/* ------------------------------------------------------------------ auth flows */

export interface SignupRequestInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  countryCode?: string;
  invitationToken?: string;
}

/** Step one: validates the details, emails a six-digit code, and stores nothing yet. */
export function requestSignup(input: SignupRequestInput): Promise<{ pending: true; email: string }> {
  return request<{ pending: true; email: string }>('/auth/signup/request', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Step two: trades the emailed code for a verified account and a fresh session. */
export function verifySignup(email: string, code: string): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('/auth/signup/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export interface ClaimInvitationInput {
  token: string;
  password: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

/**
 * Claims an invitation (office flow): sets the password on the account an admin opened and signs
 * the customer in immediately, so they land in their own portal.
 */
export function claimInvitation(input: ClaimInvitationInput): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('/auth/invitations/claim', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Always resolves the same way so the endpoint cannot be used to probe addresses. */
export function forgotPassword(email: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Sets a new password from a reset code; every old session is revoked server-side. */
export function resetPassword(
  email: string,
  code: string,
  password: string,
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ email, code, password }),
  });
}

/* ------------------------------------------------------------------- profile */

export interface ProfileInput {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  countryCode?: string | null;
}

export function updateProfile(input: ProfileInput): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true }> {
  return request<{ ok: true }>('/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/** Any signed-in user: uploads a profile photo (multipart) and returns the media row. */
export function uploadAvatar(file: File): Promise<{ media: PublicMedia }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ media: PublicMedia }>('/media/avatar', {
    method: 'POST',
    body: form,
    headers: {},
  });
}

/** Points the profile photo at an uploaded media row, or clears it with `null`. */
export function setAvatar(mediaId: string | null): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>('/auth/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ mediaId }),
  });
}

/* ---------------------------------------------------------- user administration */

export interface UserListQuery {
  page?: number;
  limit?: number;
  role?: UserRole;
  status?: 'active' | 'inactive';
  q?: string;
}

/** Super Admin: every account, including inactive ones and customers. */
export function listUsers(query: UserListQuery = {}): Promise<Paginated<PublicUser>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);
  const qs = params.toString();
  return request<Paginated<PublicUser>>(`/users${qs ? `?${qs}` : ''}`);
}

export interface UserUpdateInput {
  role?: UserRole;
  isActive?: boolean;
}

export function updateUser(id: string, input: UserUpdateInput): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export interface UserCreateInput {
  email: string;
  password: string;
  role: 'admin';
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

/** Super Admin: opens an admin account directly (already verified). */
export function createUser(input: UserCreateInput): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ------------------------------------------------------- country assignments */

/** Admin-only: every country → assigned managers binding. */
export function listCountryAssignments(): Promise<{ data: PublicCountryAssignment[] }> {
  return request<{ data: PublicCountryAssignment[] }>('/country-assignments');
}

export interface CountryAssignmentInput {
  countryCode: string;
  managerUserIds: string[];
  isActive?: boolean;
}

/** Admin-only: binds a country to the active admins who serve it (upsert). */
export function upsertCountryAssignment(
  input: CountryAssignmentInput,
): Promise<{ assignment: PublicCountryAssignment }> {
  return request<{ assignment: PublicCountryAssignment }>('/country-assignments', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/* ------------------------------------------------------------------ payments */

/** Super Admin sees every rule; a country admin only their countries plus the global defaults. */
export function listPricingRules(): Promise<{ data: PublicPricingRule[] }> {
  return request<{ data: PublicPricingRule[] }>('/pricing-rules');
}

export interface PricingRuleInput {
  /** Omit for the global default (super admin only). */
  customerCountryCode?: string;
  /** Restricts the rule to one category, or omit to let `offeringId` decide. */
  category?: ServiceCategory;
  offeringId?: string;
  amount: string;
  currency: string;
  isActive?: boolean;
}

export function createPricingRule(input: PricingRuleInput): Promise<{ rule: PublicPricingRule }> {
  return request<{ rule: PublicPricingRule }>('/pricing-rules', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updatePricingRule(
  id: string,
  input: Partial<PricingRuleInput>,
): Promise<{ rule: PublicPricingRule }> {
  return request<{ rule: PublicPricingRule }>(`/pricing-rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Super Admin sees every account; a country admin only their countries plus the global account. */
export function listPaymentAccounts(): Promise<{ data: PublicPaymentAccount[] }> {
  return request<{ data: PublicPaymentAccount[] }>('/payment-accounts');
}

export interface PaymentAccountInput {
  /** Omit for the shared global account (super admin only). */
  customerCountryCode?: string;
  currency: string;
  method?: PaymentMethod;
  /** Which way of paying into the method; defaults to its first profile. */
  profile?: string;
  label: string;
  beneficiaryName: string;
  /** The bank, mobile-money operator, wallet, exchange or desk the money lands in. */
  providerName: string;
  /** Only the keys the chosen profile declares; the server validates them. */
  identifiers?: { key: string; value: string }[];
  referenceHint?: string;
  notes?: string;
  /** Lower sorts first when several rails serve the same country and currency. */
  priority?: number;
  isActive?: boolean;
}

export function createPaymentAccount(
  input: PaymentAccountInput,
): Promise<{ paymentAccount: PublicPaymentAccount }> {
  return request<{ paymentAccount: PublicPaymentAccount }>('/payment-accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updatePaymentAccount(
  id: string,
  input: Partial<PaymentAccountInput>,
): Promise<{ paymentAccount: PublicPaymentAccount }> {
  return request<{ paymentAccount: PublicPaymentAccount }>(`/payment-accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/* --------------------------------------------------------- document library */

/** Super Admin: the reusable document library every service draws from. */
export function listDocumentRequirements(): Promise<{ data: PublicDocumentRequirement[] }> {
  return request<{ data: PublicDocumentRequirement[] }>('/document-requirements');
}

export interface DocumentRequirementInput {
  key: string;
  title: LocalizedText;
  description?: LocalizedText | null;
  kind: DocumentKind;
  order?: number;
  isActive?: boolean;
}

export function createDocumentRequirement(
  input: DocumentRequirementInput,
): Promise<{ requirement: PublicDocumentRequirement }> {
  return request<{ requirement: PublicDocumentRequirement }>('/document-requirements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDocumentRequirement(
  id: string,
  input: Partial<DocumentRequirementInput>,
): Promise<{ requirement: PublicDocumentRequirement }> {
  return request<{ requirement: PublicDocumentRequirement }>(`/document-requirements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/**
 * Uploads a private document to a case. Pass `requirementId` to satisfy a specific
 * checklist entry (the server derives the kind from it); omit it for a free upload.
 */
export function uploadCaseDocument(
  caseId: string,
  kind: DocumentKind,
  file: File,
  requirementId?: string,
): Promise<{ document: PublicCaseDocument }> {
  const form = new FormData();
  form.append('file', file);
  const params = new URLSearchParams({ kind });
  if (requirementId) {
    params.set('requirementId', requirementId);
  }
  return request<{ document: PublicCaseDocument }>(
    `/cases/${caseId}/documents?${params.toString()}`,
    { method: 'POST', body: form, headers: {} },
  );
}

/* ------------------------------------------------------- case review (admin) */

/** A short-lived, access-checked URL for one uploaded document. */
export function getCaseDocumentSignedUrl(
  caseId: string,
  documentId: string,
): Promise<{ url: string; expiresAt: string }> {
  return request<{ url: string; expiresAt: string }>(
    `/cases/${caseId}/documents/${documentId}/signed-url`,
  );
}

/** A short-lived, access-checked URL for one payment receipt. */
export function getPaymentEvidenceSignedUrl(
  evidenceId: string,
): Promise<{ url: string; expiresAt: string }> {
  return request<{ url: string; expiresAt: string }>(
    `/payment-evidence/${evidenceId}/signed-url`,
  );
}

/** Admin verdict on one uploaded document; a rejection requires a note. */
export function reviewCaseDocument(
  caseId: string,
  documentId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ document: PublicCaseDocument }> {
  return request<{ document: PublicCaseDocument }>(
    `/cases/${caseId}/documents/${documentId}/review`,
    { method: 'PATCH', body: JSON.stringify(note ? { decision, note } : { decision }) },
  );
}

/** Admin verdict on one payment receipt; a rejection requires a note. */
export function reviewPaymentEvidence(
  evidenceId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ evidence: PublicPaymentEvidence; quotation: PublicQuotation | null }> {
  return request<{ evidence: PublicPaymentEvidence; quotation: PublicQuotation | null }>(
    `/payment-evidence/${evidenceId}/review`,
    { method: 'PATCH', body: JSON.stringify(note ? { decision, note } : { decision }) },
  );
}

/** Admin decision on the whole file; accepting is gated on approved documents and payment. */
export function reviewCase(
  caseId: string,
  decision: 'accepted' | 'rejected',
  note?: string,
): Promise<{ case: PublicCase }> {
  return request<{ case: PublicCase }>(`/cases/${caseId}/review`, {
    method: 'PATCH',
    body: JSON.stringify(note ? { decision, note } : { decision }),
  });
}
