// Thin fetch wrapper matching apps/ninja-fintech/internal/api exactly —
// one function per Go handler, same request/response shapes. No
// client-side mocking: every one of these hits the Go backend, which
// hits the real Ninja sandbox for the identify() calls.
//
// The frontend (HAM, served on 5672) and the Go API (4200) are different
// origins in dev, so calls need an absolute URL — the Go server's CORS
// middleware (see apps/ninja-fintech/internal/api/util.go) is what makes
// this work. In production, apps/ninja-fintech/cmd/server would serve
// the built frontend itself (same origin), at which point this constant
// should become ''.
const API_BASE = 'http://localhost:4200'

export interface MatchField {
  field: string
  score: number
  match: string
  provided: string
  detail?: string
}

export interface Customer {
  id: string
  full_name: string
  date_of_birth: string
  id_type: 'nin' | 'bvn'
  id_number: string
  score: number
  recommendation: string
  fields: MatchField[] | null
  status: 'onboarded' | 'flagged_review' | 're_kyc_cleared' | 're_kyc_failed'
  tier: number
  daily_limit_kobo: number
  balance_kobo: number
  last_checked_at: string
  created_at: string
}

export const STATUS_LABEL: Record<string, string> = {
  onboarded: 'Onboarded ✓',
  flagged_review: 'Flagged for review',
  re_kyc_cleared: 'Re-KYC cleared ✓',
  re_kyc_failed: 'Re-KYC failed',
}

export interface Transfer {
  ID: string
  CustomerID: string
  RecipientName: string
  RecipientBank: string
  RecipientAccount: string
  AmountKobo: number
  Status: string
  Reason: string
  CreatedAt: string
}

export interface APILogEntry {
  ID: string
  Endpoint: string
  Method: string
  StatusCode: number
  DurationMs: number
  RequestPayload: { String: string; Valid: boolean }
  ResponsePayload: { String: string; Valid: boolean }
  IsMock: boolean
  CreatedAt: string
}

class APIError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new APIError(res.status, body.error ?? `request failed: ${res.status}`)
  }
  return body as T
}

export const api = {
  onboardCustomer: (input: { full_name: string; date_of_birth: string; id_type: 'nin' | 'bvn'; id_number: string }) =>
    request<{ customer: Customer; message: string }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listCustomers: () => request<Customer[] | null>('/api/customers'),

  reKYC: (customerId: string) =>
    request<{ customer: Customer; message: string }>(`/api/customers/${customerId}/re-kyc`, { method: 'POST' }),

  upgradeTier: (customerId: string) =>
    request<{ customer: Customer }>(`/api/customers/${customerId}/upgrade-tier`, { method: 'POST' }),

  requestTransfer: (customerId: string, input: { amount_naira: number; recipient_name: string; recipient_bank: string; recipient_account: string }) =>
    request<{ status: string; message: string }>(`/api/customers/${customerId}/transfer`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listTransfers: (customerId: string) => request<Transfer[] | null>(`/api/customers/${customerId}/transfers`),

  callLog: () => request<APILogEntry[] | null>('/api/admin/logs'),
}

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(
    kobo / 100,
  )
}

export { APIError }
