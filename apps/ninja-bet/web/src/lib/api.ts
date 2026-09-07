// Thin fetch wrapper matching apps/ninja-bet/internal/api exactly — one
// function per Go handler, same request/response shapes. No client-side
// mocking: every one of these hits the Go backend, which hits the real
// Ninja sandbox for the identity calls.
//
// The frontend (HAM, served on 5671) and the Go API (4100) are different
// origins in dev, so calls need an absolute URL — the Go server's CORS
// middleware (see apps/ninja-bet/internal/api/util.go) is what makes this
// work with cookies. In production, apps/ninja-bet/cmd/server would serve
// the built frontend itself (same origin as the API), at which point this
// constant should become '' so requests stay relative.
const API_BASE = 'http://localhost:4100'

export interface Player {
  id: string
  first_name: string
  last_name: string
  phone_number: string
  kyc_status: 'verified' | 'flagged_duplicate_identity' | 'blocked_underage' | 'blocked_mismatch' | 'blocked_lookup_failed'
  age?: number
  match_score?: number
  photo_data_uri?: string
  self_excluded: boolean
  balance_kobo: number
  winnings_kobo: number
  saved_bank_name?: string
  saved_account_number?: string
  face_verification_status?: 'pending' | 'passed' | 'failed'
  face_verification_url?: string
  face_score?: number
  require_face_for_payout: boolean
  liveness_threshold: number
  liveness_tier: 'low' | 'medium' | 'high' | 'custom'
}

export const LIVENESS_TIERS: { id: 'low' | 'medium' | 'high'; label: string; percent: number; blurb: string }[] = [
  { id: 'low', label: 'Low', percent: 70, blurb: 'Fewer false rejections — a good starting point while testing.' },
  { id: 'medium', label: 'Medium', percent: 85, blurb: 'Balanced — the recommended default for most accounts.' },
  { id: 'high', label: 'High', percent: 95, blurb: 'Maximum protection — some genuine attempts may need a retry.' },
]

export const STATUS_LABEL: Record<string, string> = {
  verified: 'Verified ✓',
  flagged_duplicate_identity: 'Duplicate identity',
  blocked_underage: 'Blocked · underage',
  blocked_mismatch: 'Blocked · mismatch',
  blocked_lookup_failed: 'Blocked · NIN not found',
}

export interface MatchField {
  field: string
  score: number
  match: string
  provided: string
  detail?: string
}

export interface IdentifyData {
  id_number: string
  type: string
  first_name: string
  middle_name: string
  last_name: string
  date_of_birth: string
  gender: string
  mobile: string
  address_state: string
  address_town?: string
  address_line?: string
  country?: string
  image: string
}

export interface IdentifyResult {
  status: string
  data: IdentifyData | null
  id: string
  found: boolean
  verified: boolean
  score: number
  recommendation: string
  fields: MatchField[] | null
}

export interface RegisterResponse {
  player: Player
  message: string
  lookup_result: IdentifyResult
  verify_result: IdentifyResult
}

export interface Bet {
  ID: string
  PlayerID: string
  MatchEvent: string
  Selection: string
  Odds: number
  StakeKobo: number
  Status: string
  CreatedAt: string
}

export interface Payout {
  ID: string
  PlayerID: string
  AmountKobo: number
  BeneficiaryName: { String: string; Valid: boolean }
  BankName: { String: string; Valid: boolean }
  AccountNumber: { String: string; Valid: boolean }
  Status: string
  Reason: { String: string; Valid: boolean }
  CreatedAt: string
}

export interface ImpactSummary {
  DuplicateAccountsBlocked: number
  BonusFraudPreventedKobo: number
  ImpersonationAttempts: number
  PayoutFraudAttempts: number
  PayoutFraudPreventedKobo: number
}

export interface FraudSignalAccount {
  first_name: string
  last_name: string
  kyc_status: string
  created_at: string
}

export interface FraudSignalGroup {
  id_number: string
  accounts: FraudSignalAccount[]
}

export interface Deposit {
  ID: string
  PlayerID: string
  AmountKobo: number
  Method: string
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
  register: (input: { first_name: string; last_name: string; phone_number: string; nin: string; password: string }) =>
    request<RegisterResponse>('/api/players/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: { phone_number: string; password: string }) =>
    request<{ player: Player; message: string }>('/api/players/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  me: () => request<Player>('/api/players/me'),

  logout: () => request<{ message: string }>('/api/players/logout', { method: 'POST' }),

  selfExclude: () => request<{ message: string }>('/api/players/me/self-exclude', { method: 'POST' }),

  listBets: () => request<Bet[] | null>('/api/bets'),

  placeBet: (input: { match_event: string; selection: string; odds: number; stake_naira: number }) =>
    request<{ bet_id: string; potential_win_kobo: number; balance_kobo: number }>('/api/bets', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  simulateWin: () => request<{ winnings_kobo: number }>('/api/bets/simulate-win', { method: 'POST' }),

  listPayouts: () => request<Payout[] | null>('/api/payouts'),

  requestPayout: (input: { amount_naira: number; beneficiary_name: string; bank_name: string; account_number: string; bvn: string }) =>
    request<{ status: string; message: string; duration_ms?: number; score?: number }>('/api/payouts/request', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  resetDemo: () => request<{ message: string }>('/api/demo/reset', { method: 'POST' }),

  simulateUnderage: (input: { phone_number: string; password: string }) =>
    request<RegisterResponse>('/api/demo/simulate-underage', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  saveBankDetails: (input: { bank_name: string; account_number: string }) =>
    request<{ message: string }>('/api/players/me/bank-details', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  saveSecuritySettings: (input: { require_face_for_payout: boolean; tier: 'low' | 'medium' | 'high' }) =>
    request<{ message: string }>('/api/players/me/security-settings', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  startFaceVerification: () =>
    request<{ verification_id: string; verification_url: string; expires_at: string }>(
      '/api/players/me/verify-face',
      { method: 'POST' },
    ),

  simulateFaceVerificationOutcome: (outcome: 'passed' | 'failed') =>
    request<{ status: string; message: string }>('/api/players/me/simulate-face-verification', {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    }),

  listDeposits: () => request<Deposit[] | null>('/api/deposits'),

  deposit: (input: { amount_naira: number; method: string }) =>
    request<{ balance_kobo: number }>('/api/deposits', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  callLog: () => request<APILogEntry[] | null>('/api/admin/logs'),

  impact: () => request<ImpactSummary>('/api/admin/impact'),

  fraudSignals: () => request<FraudSignalGroup[]>('/api/admin/fraud-signals'),
}

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(
    kobo / 100,
  )
}

export { APIError }
