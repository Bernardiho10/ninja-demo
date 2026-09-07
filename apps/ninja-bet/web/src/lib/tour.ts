// Vanilla port of the old Tour.tsx React component — same spotlight +
// tooltip guided tour, same steps, same localStorage-gated auto-start.
interface TourStep {
  target: string
  title: string
  body: string
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="identity"]',
    title: 'Your identity, confirmed',
    body: "This badge is Ninja's real verification result from registration — your name, age, and NIN were checked against the national registry in real time, not simulated.",
  },
  {
    target: '[data-tour="wallet"]',
    title: "Your ₦100,000 isn't withdrawable yet",
    body: "That's the welcome bonus, sitting in your balance — betting companies never let you cash out a bonus directly. Play it first. Only winnings (right-hand number here) can ever be withdrawn.",
  },
  {
    target: '[data-tour="odds"]',
    title: 'Place a bet',
    body: 'Click any odds to add a selection to your betslip.',
  },
  {
    target: '[data-tour="simulate-win"]',
    title: 'Simulate a win',
    body: 'Skip the wait — simulate a match win and see the payout flow end to end. That credits real winnings, which now actually can be withdrawn.',
  },
  {
    target: '[data-tour="withdraw"]',
    title: 'Withdraw — three independent checks',
    body: "Ninja re-checks the beneficiary name against your NIN, then again against the account's BVN — a name can be typed correctly for a bank account that isn't really yours, a BVN can't. On top of both: this account also requires a passed liveness check before any withdrawal at all. Try submitting now — watch what happens.",
  },
  {
    target: '[data-tour="profile"]',
    title: 'Harden your account',
    body: "Blocked? That's the layer-2 security you saw at withdrawal — on by default. Head to Account to complete a facial verification and set how strict the liveness bar is, then come back and withdraw again.",
  },
  {
    target: '[data-tour="fraud-signals"]',
    title: 'What compliance sees',
    body: "This is the compliance team's view — duplicate identities, bonus-farming attempts, all in one place.",
  },
  {
    target: '[data-tour="inspector"]',
    title: 'Every real API call',
    body: "Every one of ninja-bet's calls to Ninja is logged here — request, response, timing. Nothing in this demo is faked.",
  },
]

const STORAGE_KEY = 'ninjabet_tour_done'

export function hasTourRun(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

function markTourDone() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // storage unavailable — non-fatal, tour just won't remember
  }
}

export function startGuidedTour() {
  let step = 0
  let cleanupTargetListeners: (() => void) | null = null

  const overlay = document.createElement('div')
  overlay.className = 'tour-overlay'
  overlay.innerHTML = `
    <div class="tour-hole"></div>
    <div class="tour-tooltip">
      <div class="tour-actions">
        <button type="button" class="tour-skip">Skip tour</button>
        <button type="button" class="tour-next">Next</button>
      </div>
      <p class="tour-step-count"></p>
      <h4></h4>
      <p></p>
    </div>
  `
  document.body.appendChild(overlay)

  const hole = overlay.querySelector('.tour-hole') as HTMLElement
  const tooltip = overlay.querySelector('.tour-tooltip') as HTMLElement
  const stepCount = overlay.querySelector('.tour-step-count') as HTMLElement
  const titleEl = overlay.querySelector('h4') as HTMLElement
  const bodyEl = overlay.querySelector('p:not(.tour-step-count)') as HTMLElement
  const skipBtn = overlay.querySelector('.tour-skip') as HTMLButtonElement
  const nextBtn = overlay.querySelector('.tour-next') as HTMLButtonElement

  function finish() {
    markTourDone()
    cleanupTargetListeners?.()
    overlay.remove()
  }

  function renderStep() {
    cleanupTargetListeners?.()
    const s = STEPS[step]
    const el = document.querySelector(s.target) as HTMLElement | null
    if (!el) {
      if (step < STEPS.length - 1) {
        step++
        renderStep()
      } else {
        finish()
      }
      return
    }

    stepCount.textContent = `Step ${step + 1} of ${STEPS.length}`
    titleEl.textContent = s.title
    bodyEl.textContent = s.body
    nextBtn.textContent = step === STEPS.length - 1 ? 'Done' : 'Next'

    el.scrollIntoView({ block: 'center', behavior: 'smooth' })

    const update = () => {
      const rect = el.getBoundingClientRect()
      const pad = 8
      const top = rect.top - pad
      const left = rect.left - pad
      const width = rect.width + pad * 2
      const height = rect.height + pad * 2
      hole.style.top = `${top}px`
      hole.style.left = `${left}px`
      hole.style.width = `${width}px`
      hole.style.height = `${height}px`

      const tooltipWidth = 320
      // Measured, not guessed — body text length varies step to step, and
      // a hardcoded height budget cut the actions row off-screen on any
      // step whose text ran long enough to make the real card taller than
      // the guess (this is what broke steps 5/6).
      const tooltipHeight = tooltip.offsetHeight || 190
      const tooltipTop = Math.max(16, Math.min(top + height + 14, window.innerHeight - tooltipHeight - 16))
      const tooltipLeft = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16))
      tooltip.style.top = `${tooltipTop}px`
      tooltip.style.left = `${tooltipLeft}px`
      tooltip.style.width = `${tooltipWidth}px`
    }

    const raf = requestAnimationFrame(update)
    const t = setTimeout(update, 260)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    cleanupTargetListeners = () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }

  nextBtn.addEventListener('click', () => {
    if (step >= STEPS.length - 1) {
      finish()
    } else {
      step++
      renderStep()
    }
  })
  skipBtn.addEventListener('click', finish)

  renderStep()
}

export function autoStartTourIfFirstTime() {
  if (hasTourRun()) return
  // Effectively immediate — just enough of a tick that the page's first
  // paint (and refreshPlayer's DOM writes) land before the spotlight
  // measures anything, not a deliberate delay.
  setTimeout(startGuidedTour, 50)
}
