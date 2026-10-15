import type {
  PublicAuditLog,
  PublicCase,
  PublicCaseDocument,
  PublicCity,
  PublicCustomer,
  PublicInvitation,
  PublicMessage,
  PublicNotification,
  PublicOffering,
  PublicPaymentEvidence,
  PublicProvider,
  PublicQuotation,
  PublicUser,
  ServiceCategory,
} from '@medbourse/shared';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export function apiUrl(path: string): string {
  return `${apiBase}${path}`;
}

export async function parseApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) {
      return body.error.message;
    }
  } catch {
    /* non-JSON */
  }
  return `HTTP ${res.status}`;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export interface ApiError extends Error {
  status: number;
  code?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const message = await parseApiError(res);
    const err = new Error(message) as ApiError;
    err.status = res.status;
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

/** Active accounts that may manage customers (staff/admin/super_admin). Admin-only endpoint. */
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
  isActive?: boolean;
  partnershipVerified?: boolean;
}

export function listProviders(
  params: { includeInactive?: boolean } = {},
): Promise<{ data: PublicProvider[] }> {
  const qs = new URLSearchParams();
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
  title: string;
  summary: string;
  requirementsSummary?: string;
  providerId: string;
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
  actorUserId?: string;
}

export function listAuditLogs(query: AuditListQuery = {}): Promise<Paginated<PublicAuditLog>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.action) params.set('action', query.action);
  if (query.entityType) params.set('entityType', query.entityType);
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
