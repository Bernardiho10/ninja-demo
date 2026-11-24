import { SandboxCompany, SandboxDirector } from './kybSandbox'

export interface KybTelemetryLog {
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

export interface KybDemoState {
  currentStep: 1 | 2 | 3
  company: {
    rcNumber: string
    companyName: string
    companyType: string
    status: 'ACTIVE' | 'INACTIVE' | 'NOT_FOUND' | 'UNVERIFIED'
    verified: boolean
    details?: SandboxCompany
    opsDecision?: 'CONDITIONAL_APPROVED' | 'PAYMENT_HELD' | 'NONE'
    gracePeriodDays?: number
    remediationDeadline?: string
  }
  directors: {
    audited: boolean
    list: SandboxDirector[]
    hasConflict?: boolean
  }
  hostedFlow: {
    flowId?: string
    flowName?: string
    linkUrl?: string
    status: 'idle' | 'created' | 'link_generated' | 'completed'
  }
  logs: KybTelemetryLog[]
}

const STORAGE_KEY = 'ninjakyb:demo-state'

export const INITIAL_KYB_STATE: KybDemoState = {
  currentStep: 1,
  company: {
    rcNumber: '',
    companyName: '',
    companyType: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
    status: 'UNVERIFIED',
    verified: false,
  },
  directors: {
    audited: false,
    list: [],
  },
  hostedFlow: {
    status: 'idle',
  },
  logs: [],
}

export function loadKybState(): KybDemoState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...INITIAL_KYB_STATE }
    return JSON.parse(raw)
  } catch {
    return { ...INITIAL_KYB_STATE }
  }
}

export function saveKybState(state: KybDemoState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export function resetKybDemoState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function isKybStep1Complete(state: KybDemoState): boolean {
  if (!state.company.verified || state.company.status === 'UNVERIFIED' || state.company.status === 'NOT_FOUND') {
    return false
  }
  if (state.company.status === 'INACTIVE') {
    return state.company.opsDecision === 'CONDITIONAL_APPROVED'
  }
  return true
}

export function isKybStep2Complete(state: KybDemoState): boolean {
  return isKybStep1Complete(state) && state.directors.audited === true
}

export function canAccessKybStep(step: 1 | 2 | 3, state: KybDemoState): { allowed: boolean; reason?: string } {
  if (step === 1) return { allowed: true }
  if (step === 2) {
    if (!isKybStep1Complete(state)) {
      return { allowed: false, reason: 'Step 1 (Company Check) required' }
    }
    return { allowed: true }
  }
  if (step === 3) {
    if (!isKybStep1Complete(state)) {
      return { allowed: false, reason: 'Step 1 (Company Check) required' }
    }
    if (!isKybStep2Complete(state)) {
      return { allowed: false, reason: 'Step 2 (Directors Check) required' }
    }
    return { allowed: true }
  }
  return { allowed: false }
}
