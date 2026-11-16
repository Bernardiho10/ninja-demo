// State management for ninja-credit demo

export interface Borrower {
  firstName: string
  lastName: string
  phone: string
  bvn: string
  dob: string
  kycStatus: 'unverified' | 'verified' | 'failed'
}

export interface LoanRequest {
  amountNaira: number
  amountKobo: number
  purpose: string
  tenorMonths: number
  reference: string
  consent: boolean
}

export interface CreditCheckData {
  score: number | null
  band: 'excellent' | 'good' | 'fair' | 'poor' | null
  recommendation: 'approve' | 'review' | 'deny' | null
  reasons: string[]
  eligibleAmountNaira: number
  eligibleAmountKobo: number
  summary: {
    institutions: number
    totalLoans: number
    openLoans: number
    closedLoans: number
    performingLoans: number
    nonPerformingLoans: number
    openNonPerformingLoans: number
    missedRepayments: number
    totalCreditValue: number
    highestCredit: number
    openCreditValue: number
  } | null
  raw: any
}

export interface CreditHistoryData {
  profile: {
    fullName: string
    gender: string
    addressHistory: Array<{
      address: string
      type: string
      dateReported: string
    }>
    identifications: Array<{
      type: string
      number: string
    }>
  } | null
  accounts: Array<{
    institution: string
    loans: Array<{
      status: string
      performance: string
      currency: string
      openingBalance: number
      repaymentAmount: number
      repaymentFrequency: string
      tenor: number
      dateOpened: string
      dateClosed?: string
      repaymentSchedule: Array<{
        period: string
        status: string
      }>
    }>
  }>
  raw: any
}

export interface DisbursementData {
  status: 'idle' | 'disbursed' | 'declined'
  transactionRef: string | null
  timestamp: string | null
  accountNumber: string
  bankName: string
}

export interface CreditTelemetryLog {
  id: string
  timestamp: string
  step: string
  method: 'GET' | 'POST'
  endpoint: string
  status: number
  durationMs: number
  request: any
  response: any
}

export interface CreditDemoState {
  currentStep: 1 | 2 | 3
  borrower: Borrower
  loanRequest: LoanRequest
  creditCheck: CreditCheckData | null
  creditHistory: CreditHistoryData | null
  disbursement: DisbursementData | null
  logs: CreditTelemetryLog[]
}

const STORAGE_KEY = 'ninja_credit_state_v1'

export const DEFAULT_CREDIT_STATE: CreditDemoState = {
  currentStep: 1,
  borrower: {
    firstName: '',
    lastName: '',
    phone: '',
    bvn: '',
    dob: '',
    kycStatus: 'unverified',
  },
  loanRequest: {
    amountNaira: 500000,
    amountKobo: 50000000,
    purpose: 'Business Working Capital',
    tenorMonths: 6,
    reference: 'loan-app-1042',
    consent: true,
  },
  creditCheck: null,
  creditHistory: null,
  disbursement: null,
  logs: [],
}

export function loadCreditState(): CreditDemoState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        ...DEFAULT_CREDIT_STATE,
        ...parsed,
        borrower: { ...DEFAULT_CREDIT_STATE.borrower, ...(parsed.borrower || {}) },
        loanRequest: { ...DEFAULT_CREDIT_STATE.loanRequest, ...(parsed.loanRequest || {}) },
      }
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_CREDIT_STATE))
}

export function saveCreditState(state: CreditDemoState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export function resetCreditDemoState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function isStep1Complete(state: CreditDemoState): boolean {
  return state.borrower.kycStatus === 'verified' && Boolean(state.borrower.bvn)
}

export function isStep2Complete(state: CreditDemoState): boolean {
  return isStep1Complete(state) && state.creditCheck !== null
}

export function canAccessCreditStep(
  targetStep: number,
  state: CreditDemoState
): { allowed: boolean; reason?: string } {
  if (targetStep === 1) return { allowed: true }
  if (targetStep === 2) {
    if (!isStep1Complete(state)) {
      return { allowed: false, reason: 'Complete Step 1 (Borrower KYC) first' }
    }
    return { allowed: true }
  }
  if (targetStep === 3) {
    if (!isStep1Complete(state)) {
      return { allowed: false, reason: 'Complete Step 1 (Borrower KYC) first' }
    }
    if (!isStep2Complete(state)) {
      return { allowed: false, reason: 'Run Step 2 (Bureau Credit Check) first' }
    }
    return { allowed: true }
  }
  return { allowed: false, reason: 'Invalid step' }
}
