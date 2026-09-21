// =============================================================================
// ninja-bet V2: Reactive State Machine (Browser Storage / GitHub Pages Ready)
// =============================================================================

export interface PlayerState {
  id: string
  firstName: string
  lastName: string
  phoneNumber: string
  nin: string
  dateOfBirth: string
  age: number
  walletBalanceNaira: number
  withdrawableBalanceNaira: number
  kycStatus: 'unverified' | 'verified' | 'blocked_mismatch' | 'blocked_underage'
  matchScore: number
}

export interface BankAccountState {
  bankName: string
  accountNumber: string
  bvn: string
  isVerified: boolean
}

export interface WithdrawalState {
  amountNaira: number
  scenario: 'prefilled' | 'unfilled' | 'custom'
  verificationUrl?: string
  verificationId?: string
  faceStatus: 'unverified' | 'pending' | 'passed' | 'failed'
  livenessScore?: number
  isDisbursed: boolean
}

export interface TelemetryLog {
  id: string
  timestamp: string
  method: 'POST' | 'GET'
  endpoint: string
  status: number
  durationMs: number
  requestPayload: any
  responsePayload: any
  summary: string
}

export interface V2State {
  currentStep: 1 | 2 | 3
  player: PlayerState
  bankAccount: BankAccountState | null
  withdrawal: WithdrawalState
  logs: TelemetryLog[]
}

const STORAGE_KEY = 'ninjabet_v2_state'

const DEFAULT_STATE: V2State = {
  currentStep: 1,
  player: {
    id: 'player_007',
    firstName: 'James',
    lastName: 'Bond',
    phoneNumber: '08012345678',
    nin: '77777777777',
    dateOfBirth: '1975-01-01',
    age: 49,
    walletBalanceNaira: 250000,
    withdrawableBalanceNaira: 250000,
    kycStatus: 'unverified',
    matchScore: 1.0,
  },
  bankAccount: null,
  withdrawal: {
    amountNaira: 250000,
    scenario: 'prefilled',
    faceStatus: 'unverified',
    isDisbursed: false,
  },
  logs: [],
}

export function loadState(): V2State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_STATE, ...parsed }
    }
  } catch (e) {
    console.warn('Failed to load state from localStorage:', e)
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE))
}

export function saveState(state: V2State): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save state to localStorage:', e)
  }
}

export function resetDemoState(): V2State {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('ninjabet_tour_done')
  } catch {}
  const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE))
  saveState(fresh)
  return fresh
}
