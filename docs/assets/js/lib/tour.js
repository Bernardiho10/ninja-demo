const STEPS = [
    {
        target: '[data-tour="wallet"]',
        title: '1. Welcome Bonus (Non-Withdrawable)',
        body: 'Notice your ₦100,000 balance: under NLRC regulations and anti-bonus-farming rules, welcome credit cannot be withdrawn directly. It must be wagered. Withdrawable winnings start at ₦0 until you play and win.',
    },
    {
        target: '[data-tour="odds"]',
        title: '2. Select Match Odds & Book Bet',
        body: 'Click any match odds (e.g., Arsenal vs Chelsea @ 2.10) to add a pick to your betslip, specify your stake, and place your bet.',
    },
    {
        target: '[data-tour="simulate-win"]',
        title: '3. Win a Ticket (+₦250,000 Winnings)',
        body: 'Click "Simulate Match Win (+₦250,000)" to simulate winning the wager. Celebratory confetti will fire, and ₦250,000 will be credited directly into your Withdrawable Winnings balance!',
    },
    {
        target: '[data-tour="bank-details"]',
        title: '4. Add Bank Account & BVN Ownership Check',
        body: 'Configure your payout bank account and 11-digit BVN. Ninja executes a real-time BVN ownership verification. If someone attempts to use a mismatched BVN (try 22222222222), the setup is immediately blocked!',
    },
    {
        target: '[data-tour="withdraw"]',
        title: '5. Request High-Stakes Withdrawal',
        body: 'Click Withdraw for ₦250,000. Because this is a high-stakes payout, the system automatically prompts for Layer-2 Biometric 2-Step Authentication to protect against Account Takeover (ATO).',
    },
    {
        target: '[data-tour="biometrics-card"]',
        title: '6. Biometric Facial 2FA (user betID Link)',
        body: 'Ninja generates a secure single-use camera verification link carrying your custom field "user betID". Complete the live webcam selfie or click "Simulate Pass (97%)" to clear the security gate.',
    },
    {
        target: '[data-tour="instant-payout"]',
        title: '7. Automated Instant Bank Disbursement',
        body: 'Once facial verification clears the threshold, the instant bank withdrawal is approved and debited from your winnings balance. Funds are sent to your verified bank account!',
    },
];
const STORAGE_KEY = 'ninjabet_tour_done';
function hasTourRun() {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    }
    catch {
        return true;
    }
}
function markTourDone() {
    try {
        localStorage.setItem(STORAGE_KEY, '1');
    }
    catch { }
}
function startGuidedTour() {
    let step = 0;
    let cleanupTargetListeners = null;
    // Remove existing tour overlay if present
    document.querySelector('.tour-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.innerHTML = `
    <div class="tour-hole"></div>
    <div class="tour-tooltip">
      <div class="tour-actions">
        <button type="button" class="tour-skip">Skip tour</button>
        <button type="button" class="tour-next">Next →</button>
      </div>
      <p class="tour-step-count"></p>
      <h4></h4>
      <p></p>
    </div>
  `;
    document.body.appendChild(overlay);
    const hole = overlay.querySelector('.tour-hole');
    const tooltip = overlay.querySelector('.tour-tooltip');
    const stepCount = overlay.querySelector('.tour-step-count');
    const titleEl = overlay.querySelector('h4');
    const bodyEl = overlay.querySelector('p:not(.tour-step-count)');
    const skipBtn = overlay.querySelector('.tour-skip');
    const nextBtn = overlay.querySelector('.tour-next');
    function finish() {
        markTourDone();
        cleanupTargetListeners?.();
        overlay.remove();
    }
    function renderStep() {
        cleanupTargetListeners?.();
        const s = STEPS[step];
        const el = document.querySelector(s.target);
        if (!el) {
            if (step < STEPS.length - 1) {
                step++;
                renderStep();
            }
            else {
                finish();
            }
            return;
        }
        stepCount.textContent = `Demo Step ${step + 1} of ${STEPS.length}`;
        titleEl.textContent = s.title;
        bodyEl.textContent = s.body;
        nextBtn.textContent = step === STEPS.length - 1 ? 'Finish Tour ✓' : 'Next Step →';
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const update = () => {
            const rect = el.getBoundingClientRect();
            const pad = 8;
            const top = rect.top - pad;
            const left = rect.left - pad;
            const width = rect.width + pad * 2;
            const height = rect.height + pad * 2;
            hole.style.top = `${top}px`;
            hole.style.left = `${left}px`;
            hole.style.width = `${width}px`;
            hole.style.height = `${height}px`;
            const tooltipWidth = 340;
            const tooltipHeight = tooltip.offsetHeight || 210;
            const tooltipTop = Math.max(16, Math.min(top + height + 14, window.innerHeight - tooltipHeight - 16));
            const tooltipLeft = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
            tooltip.style.top = `${tooltipTop}px`;
            tooltip.style.left = `${tooltipLeft}px`;
            tooltip.style.width = `${tooltipWidth}px`;
        };
        const raf = requestAnimationFrame(update);
        const t = setTimeout(update, 260);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        cleanupTargetListeners = () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
            cancelAnimationFrame(raf);
            clearTimeout(t);
        };
    }
    nextBtn.addEventListener('click', () => {
        if (step >= STEPS.length - 1) {
            finish();
        }
        else {
            step++;
            renderStep();
        }
    });
    skipBtn.addEventListener('click', finish);
    renderStep();
}
function autoStartTourIfFirstTime() {
    const urlParams = new URLSearchParams(window.location.search);
    const forceTour = urlParams.get('tour') === '1';
    if (forceTour || !hasTourRun()) {
        setTimeout(startGuidedTour, 300);
    }
}

export { autoStartTourIfFirstTime, hasTourRun, markTourDone, startGuidedTour };
