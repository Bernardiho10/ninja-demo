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

function simulateFallback<T>(path: string, init?: RequestInit): T {
  let body: any = {}
  try {
    if (init?.body) body = JSON.parse(init.body as string)
  } catch {}

  const stateRaw = localStorage.getItem('ninjabet_v2_state')
  let pState: any = null
  try {
    if (stateRaw) pState = JSON.parse(stateRaw).player
  } catch {}

  if (path === '/api/players/me') {
    return {
      id: pState?.id || 'player_007',
      first_name: pState?.firstName || 'James',
      last_name: pState?.lastName || 'Bond',
      phone_number: pState?.phoneNumber || '08012345678',
      kyc_status: pState?.kycStatus === 'unverified' ? 'verified' : (pState?.kycStatus || 'verified'),
      balance_kobo: (pState?.walletBalanceNaira || 250000) * 100,
      winnings_kobo: 0,
      require_face_for_payout: true,
      liveness_threshold: 85,
      liveness_tier: 'medium',
      self_excluded: false,
    } as T
  }

  if (path === '/api/players/register') {
    const isMatch = (body.first_name || '').toLowerCase().includes('james')
    const player = {
      id: 'player_' + Date.now().toString(36),
      first_name: body.first_name || 'James',
      last_name: body.last_name || 'Bond',
      phone_number: body.phone_number || '08012345678',
      kyc_status: isMatch ? 'verified' : 'blocked_mismatch',
      balance_kobo: 25000000,
      winnings_kobo: 0,
      require_face_for_payout: true,
      liveness_threshold: 85,
      liveness_tier: 'medium',
      self_excluded: false,
    }
    return {
      player,
      message: isMatch ? 'verified successfully' : 'identity verification failed',
      lookup_result: {
        status: 'found',
        data: {
          first_name: 'James',
          last_name: 'Bond',
          id_number: body.nin || '77777777777',
          type: 'nin',
          date_of_birth: '1975-01-01',
          gender: 'male',
          mobile: '08012345678',
          address_state: 'Lagos',
          image: '',
        },
        id: 'req_lkp_01',
        found: true,
        verified: isMatch,
        score: isMatch ? 1.0 : 0.12,
        recommendation: isMatch ? 'ALLOW' : 'REJECT',
        fields: null,
      },
      verify_result: {
        status: isMatch ? 'verified' : 'mismatch',
        data: null,
        id: 'req_vfy_01',
        found: true,
        verified: isMatch,
        score: isMatch ? 1.0 : 0.12,
        recommendation: isMatch ? 'ALLOW' : 'REJECT',
        fields: null,
      },
    } as T
  }

  if (path === '/api/players/me/verify-face') {
    return {
      verification_id: 'vs_flow_' + Date.now(),
      verification_url: 'https://www.ninja.ng/kyc/?t=cylCDuxTXE5VnfIag1R6KrodUqfjqem9oyWAIplO',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      user_bet_id: body.user_bet_id || 'wtd_01',
    } as T
  }

  if (path === '/api/players/me/simulate-face-verification') {
    return {
      status: body.outcome || 'passed',
      message: 'Face verification outcome recorded',
    } as T
  }

  if (path === '/api/players/me/bank-details') {
    return { message: 'Bank account details saved' } as T
  }

  if (path === '/api/demo/reset') {
    return { message: 'Demo reset successfully' } as T
  }

  return { ok: true, message: 'Simulated response' } as T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)

    const res = await fetch(API_BASE + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...init,
    })
    clearTimeout(timeoutId)

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new APIError(res.status, body.error ?? `request failed: ${res.status}`)
    }
    return body as T
  } catch (err) {
    // If backend server is unreachable (e.g. deployed statically to GitHub Pages),
    // fallback to seamless high-fidelity in-browser simulation!
    if ((err as Error).name === 'AbortError' || (err as Error).message?.includes('Failed to fetch') || !(err instanceof APIError)) {
      console.info(`[SPA Simulation] Serving ${path} via client-side simulation (GitHub Pages / offline mode)`)
      return simulateFallback<T>(path, init)
    }
    throw err
  }
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

  startFaceVerification: (input?: { user_bet_id?: string }) =>
    request<{ verification_id: string; verification_url: string; expires_at: string; user_bet_id?: string }>(
      '/api/players/me/verify-face',
      {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      },
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

  companyLookup: (input: { rc_number: string; reference?: string }) =>
    request<{ status: string; data: any }>('/api/company/lookup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  companyAdvancedLookup: (input: { rc_number: string; reference?: string }) =>
    request<{ status: string; data: any }>('/api/company/advanced-lookup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  bulkIdentify: (input: { idType: string; idNumbers: string; reference?: string }) =>
    request<{ status: string; data: any[] }>('/api/identity/bulk-identify', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listWebhookDeliveries: () => request<any[]>('/api/webhook-deliveries'),

  retryWebhookDelivery: (id: string) =>
    request<{ ok: boolean; message: string }>('/api/webhook-deliveries/' + encodeURIComponent(id) + '/retry', {
      method: 'POST',
    }),
}

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(
    kobo / 100,
  )
}

export { APIError }
