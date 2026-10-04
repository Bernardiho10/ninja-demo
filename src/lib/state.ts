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
  faceStatus: 'unverified' | 'pending' | 'passed' | 'incomplete' | 'failed'
  livenessScore?: number
  isDisbursed: boolean
}

export interface TelemetryLog {
  id: string
  timestamp: string
  step: string
  method: 'POST' | 'GET'
  endpoint: string
  status: number
  durationMs: number
  requestPayload: any
  responsePayload: any
  summary: string
}

export interface Thresholds {
  face: number
  liveness: number
}

export interface CreatedFlowRef {
  id: string
  name: string
  // What the flow was created with on Ninja; the payout gate checks against these.
  thresholds: Thresholds
}

export interface V2State {
  currentStep: 1 | 2 | 3
  player: PlayerState
  bankAccount: BankAccountState | null
  withdrawal: WithdrawalState
  logs: TelemetryLog[]
  createdFlows: Partial<Record<'prefilled' | 'unfilled' | 'custom', CreatedFlowRef>>
  // Set by the user for the Custom scenario (50-100).
  customThresholds: Thresholds
}

const STORAGE_KEY = 'ninjabet_v2_state'

const DEFAULT_STATE: V2State = {
  currentStep: 1,
  player: {
    id: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    nin: '',
    dateOfBirth: '',
    age: 0,
    walletBalanceNaira: 0,
    withdrawableBalanceNaira: 0,
    kycStatus: 'unverified',
    matchScore: 0,
  },
  bankAccount: null,
  withdrawal: {
    amountNaira: 250000,
    scenario: 'prefilled',
    faceStatus: 'unverified',
    isDisbursed: false,
  },
  logs: [],
  createdFlows: {},
  customThresholds: { face: 90, liveness: 90 },
}

export function loadState(): V2State {
  try {
    // Purge any legacy localStorage state to avoid old session contamination
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}

    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const merged: V2State = { ...DEFAULT_STATE, ...parsed }
      merged.logs = Array.isArray(parsed.logs) ? parsed.logs : []
      // The player name should not be set until registration is finished
      if (merged.player && merged.player.kycStatus !== 'verified') {
        merged.player.firstName = ''
        merged.player.lastName = ''
        merged.player.phoneNumber = ''
        merged.player.nin = ''
        merged.player.dateOfBirth = ''
        merged.player.walletBalanceNaira = 0
        merged.player.withdrawableBalanceNaira = 0
      }
      return merged
    }
  } catch (e) {
    console.warn('Failed to load state from sessionStorage:', e)
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE))
}

export function saveState(state: V2State): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save state to sessionStorage:', e)
  }
}

export function resetDemoState(): V2State {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
  const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE))
  saveState(fresh)
  return fresh
}
