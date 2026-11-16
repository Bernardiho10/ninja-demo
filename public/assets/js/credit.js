import confetti from './vendor/canvas-confetti/dist/confetti.module.js';
import Prism from './vendor/prismjs/prism.js';
import './vendor/prismjs/components/prism-go.js';
import './vendor/prismjs/components/prism-bash.js';
import './vendor/prismjs/components/prism-python.js';
import './vendor/prismjs/components/prism-rust.js';
import { loadCreditState, canAccessCreditStep, saveCreditState } from './lib/creditState.js';
import { SANDBOX_CREDIT_BVNS, getSandboxCreditHistory, getSandboxCreditCheck } from './lib/creditSandbox.js';
import './analytics.js';

// =============================================================================
// ninja-credit: Interactive Credit Check & Underwriting Workbench
// =============================================================================
let state = loadCreditState();
let lastToastTime = 0;
let lastToastMsg = '';
function showToast(message, type = 'warning') {
    const now = Date.now();
    if (lastToastMsg === message && now - lastToastTime < 1500) {
        return;
    }
    lastToastTime = now;
    lastToastMsg = message;
    let container = document.getElementById('ninja-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'ninja-toast-container';
        container.className = 'ninja-toast-container';
        document.body.appendChild(container);
    }
    container.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = `ninja-toast toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';
    toast.innerHTML = `
    <span class="toast-icon-badge">${icon}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" title="Dismiss">✕</button>
  `;
    const closeBtn = toast.querySelector('.toast-close');
    let timer = null;
    const dismiss = () => {
        if (timer)
            clearTimeout(timer);
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px) scale(0.96)';
        setTimeout(() => {
            toast.remove();
        }, 180);
    };
    closeBtn?.addEventListener('click', dismiss);
    container.appendChild(toast);
    timer = setTimeout(dismiss, 3500);
}
function escapeHtml(str) {
    if (!str)
        return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function formatNaira(val) {
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        maximumFractionDigits: 0,
    }).format(val || 0);
}
function formatKoboToNaira(kobo) {
    return formatNaira(Math.round((kobo || 0) / 100));
}
function init() {
    state.logs = [];
    bindLoanParams();
    bindStep1();
    bindStep2();
    bindStep3();
    bindDevTools();
    // Navigation listener
    window.addEventListener('ninjacredit:navigate-step', (e) => {
        if (e.detail?.step) {
            goToStep(e.detail.step);
        }
    });
    // Toast listener
    window.addEventListener('ninjacredit:show-toast', (e) => {
        if (e.detail?.message) {
            showToast(e.detail.message, e.detail.type || 'warning');
        }
    });
    if (!canAccessCreditStep(state.currentStep, state).allowed) {
        state.currentStep = 1;
    }
    goToStep(state.currentStep);
    syncFields();
    renderLogs();
}
function goToStep(step) {
    const access = canAccessCreditStep(step, state);
    if (!access.allowed) {
        showToast(access.reason || 'Complete previous steps first', 'warning');
        return;
    }
    state.currentStep = step;
    saveCreditState(state);
    window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
    const view1 = document.getElementById('view-credit-step-1');
    const view2 = document.getElementById('view-credit-step-2');
    const view3 = document.getElementById('view-credit-step-3');
    if (view1)
        view1.hidden = step !== 1;
    if (view2)
        view2.hidden = step !== 2;
    if (view3)
        view3.hidden = step !== 3;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function syncFields() {
    // Sync Borrower
    const fName = document.getElementById('input-borrower-fname');
    const lName = document.getElementById('input-borrower-lname');
    const phone = document.getElementById('input-borrower-phone');
    const bvn = document.getElementById('input-borrower-bvn');
    const dob = document.getElementById('input-borrower-dob');
    const ref = document.getElementById('input-credit-ref');
    const amountInput = document.getElementById('input-loan-amount');
    if (fName && state.borrower.firstName)
        fName.value = state.borrower.firstName;
    if (lName && state.borrower.lastName)
        lName.value = state.borrower.lastName;
    if (phone && state.borrower.phone)
        phone.value = state.borrower.phone;
    if (bvn && state.borrower.bvn)
        bvn.value = state.borrower.bvn;
    if (dob && state.borrower.dob)
        dob.value = state.borrower.dob;
    if (ref && state.loanRequest.reference)
        ref.value = state.loanRequest.reference;
    if (amountInput && state.loanRequest.amountNaira)
        amountInput.value = String(state.loanRequest.amountNaira);
    // Step 2 & 3 summaries
    const c2Borrower = document.getElementById('c2-borrower-summary');
    const c2Amount = document.getElementById('c2-amount-summary');
    if (c2Borrower) {
        c2Borrower.textContent = state.borrower.firstName
            ? `${state.borrower.firstName} ${state.borrower.lastName} · BVN: ${state.borrower.bvn}`
            : `James Bond · BVN: ${SANDBOX_CREDIT_BVNS.CLEAN}`;
    }
    if (c2Amount) {
        c2Amount.textContent = formatNaira(state.loanRequest.amountNaira);
    }
    // Restore Step 2 results if present
    if (state.creditCheck) {
        renderCreditCheckResults(state.creditCheck);
    }
    // Restore Step 3 results if present
    if (state.creditHistory) {
        renderCreditHistoryResults(state.creditHistory);
    }
}
// -----------------------------------------------------------------------------
// Loan Request Parameters & Presets
// -----------------------------------------------------------------------------
function bindLoanParams() {
    const amountInput = document.getElementById('input-loan-amount');
    const purposeSelect = document.getElementById('select-loan-purpose');
    const tenorSelect = document.getElementById('select-loan-tenor');
    const updateAmount = (amount) => {
        state.loanRequest.amountNaira = amount;
        state.loanRequest.amountKobo = amount * 100;
        if (amountInput)
            amountInput.value = String(amount);
        saveCreditState(state);
        window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
        syncFields();
        document.querySelectorAll('.param-preset-btn').forEach((b) => {
            const btn = b;
            if (Number(btn.dataset.amount) === amount) {
                btn.classList.add('active');
            }
            else {
                btn.classList.remove('active');
            }
        });
    };
    document.querySelectorAll('.param-preset-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const amt = Number(btn.dataset.amount);
            if (amt)
                updateAmount(amt);
        });
    });
    amountInput?.addEventListener('input', () => {
        const amt = Number(amountInput.value) || 0;
        state.loanRequest.amountNaira = amt;
        state.loanRequest.amountKobo = amt * 100;
        saveCreditState(state);
        window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
        syncFields();
    });
    purposeSelect?.addEventListener('change', () => {
        state.loanRequest.purpose = purposeSelect.value;
        saveCreditState(state);
    });
    tenorSelect?.addEventListener('change', () => {
        state.loanRequest.tenorMonths = Number(tenorSelect.value) || 6;
        saveCreditState(state);
    });
}
// -----------------------------------------------------------------------------
// STEP 1: Borrower KYC & BVN Verification
// -----------------------------------------------------------------------------
function bindStep1() {
    const form = document.getElementById('form-credit-step-1');
    const fName = document.getElementById('input-borrower-fname');
    const lName = document.getElementById('input-borrower-lname');
    const phone = document.getElementById('input-borrower-phone');
    const bvn = document.getElementById('input-borrower-bvn');
    const dob = document.getElementById('input-borrower-dob');
    const ref = document.getElementById('input-credit-ref');
    const consent = document.getElementById('check-consent');
    const resultBox = document.getElementById('credit-step1-result');
    const setStep1Fields = (first, last, ph, bvnNum, birth) => {
        if (fName)
            fName.value = first;
        if (lName)
            lName.value = last;
        if (phone)
            phone.value = ph;
        if (bvn)
            bvn.value = bvnNum;
        if (dob)
            dob.value = birth;
    };
    // Presets
    document.getElementById('btn-credit-preset-prime')?.addEventListener('click', () => {
        setStep1Fields('James', 'Bond', '08012345678', SANDBOX_CREDIT_BVNS.CLEAN, '1975-01-01');
        showToast('Loaded Prime Borrower preset (James Bond · BVN 77777777777)', 'info');
    });
    document.getElementById('btn-credit-preset-mismatch')?.addEventListener('click', () => {
        setStep1Fields('Chinedu', 'Okafor', '08098765432', SANDBOX_CREDIT_BVNS.CLEAN, '1990-05-12');
        showToast('Loaded Mismatched Identity preset (Wrong Name for BVN 77777777777)', 'warning');
    });
    document.getElementById('btn-credit-preset-notfound')?.addEventListener('click', () => {
        setStep1Fields('Unknown', 'Borrower', '08055555555', SANDBOX_CREDIT_BVNS.NOT_FOUND, '1988-08-08');
        showToast('Loaded Unregistered BVN preset (55555555555)', 'warning');
    });
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!consent?.checked) {
            showToast('Credit Reporting Act consent is required to proceed.', 'error');
            return;
        }
        const payload = {
            type: 'bvn',
            number: bvn.value.trim(),
            first_name: fName.value.trim(),
            last_name: lName.value.trim(),
            phone: phone.value.trim(),
            dob: dob.value.trim(),
        };
        state.borrower.firstName = payload.first_name;
        state.borrower.lastName = payload.last_name;
        state.borrower.phone = payload.phone;
        state.borrower.bvn = payload.number;
        state.borrower.dob = payload.dob;
        state.loanRequest.reference = ref?.value.trim() || 'loan-app-1042';
        const submitBtn = document.getElementById('btn-submit-credit-step1');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
        <span style="font-size: 16px;">⏳</span>
        <span>Verifying Borrower Identity with Ninja...</span>
      `;
        }
        const t0 = performance.now();
        let status = 200;
        let body = null;
        try {
            const res = await fetch('/api/identity/identify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            status = res.status;
            body = await readApiBody(res);
            if (status >= 500 || body?.error === 'NINJA_SANDBOX_SECRET_KEY is not set') {
                throw new Error('Sandbox key not configured on backend, falling back to local sandbox fixture');
            }
        }
        catch {
            // Fallback for static demo
            const bvnNum = payload.number;
            const isJames = (payload.first_name || '').toLowerCase().includes('james') &&
                (payload.last_name || '').toLowerCase().includes('bond');
            if (bvnNum === SANDBOX_CREDIT_BVNS.CLEAN && isJames) {
                status = 200;
                body = {
                    status: 'verified',
                    verified: true,
                    score: 1.0,
                    matches: { first_name: 100, last_name: 100, dob: 100 },
                    data: { first_name: 'JAMES', last_name: 'BOND', dob: '1975-01-01', age: 49 },
                };
            }
            else if (bvnNum === SANDBOX_CREDIT_BVNS.CLEAN) {
                status = 200;
                body = {
                    status: 'failed',
                    verified: false,
                    score: 0.2,
                    matches: { first_name: 0, last_name: 0, dob: 0 },
                    reasons: ['name_mismatch'],
                };
            }
            else {
                status = 200;
                body = { status: 'not_found', verified: false, found: false, reasons: ['id_not_found'] };
            }
        }
        const duration = Math.round(performance.now() - t0);
        addLog('Step 1 · Borrower KYC', 'POST', '/api/identity/identify', status, duration, payload, body);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
        <span style="font-size: 16px;">🛡️</span>
        <span>Verify Borrower Identity &amp; Proceed to Credit Check</span>
        <span style="font-size: 16px;">→</span>
      `;
        }
        if (!resultBox)
            return;
        resultBox.hidden = false;
        const isVerified = status === 200 && body?.status === 'verified';
        if (isVerified) {
            state.borrower.kycStatus = 'verified';
            saveCreditState(state);
            window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
            resultBox.innerHTML = `
        <div class="success" style="padding: 16px; border: 1px solid rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.08);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <strong style="color: #10b981; font-size: 15px;">✓ Borrower Identity Verified (NIBSS BVN Match 100%)</strong>
            <span class="status-badge perf-performing">KYC Passed</span>
          </div>
          <p style="font-size: 12.5px; color: #cbd5e1; margin: 0 0 12px; line-height: 1.5;">
            The borrower's details match government registry records. The applicant is confirmed as <strong>${escapeHtml(payload.first_name)} ${escapeHtml(payload.last_name)}</strong> (Adult, Age 49).
          </p>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-goto-credit-step2" class="preset-chip preset-pass" style="padding: 10px 16px; font-weight: 800; font-size: 13px;">
              ⚡ Proceed to Step 2: Instant Credit Check →
            </button>
          </div>
        </div>
      `;
            document.getElementById('btn-goto-credit-step2')?.addEventListener('click', () => {
                goToStep(2);
            });
            showToast('Borrower KYC passed! Moving to Step 2.', 'success');
        }
        else {
            state.borrower.kycStatus = 'failed';
            saveCreditState(state);
            window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
            const reasonMsg = body?.reasons?.join(', ') || body?.error || 'Name or ID did not match government record';
            resultBox.innerHTML = `
        <div class="error" style="padding: 16px; border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08);">
          <strong style="color: #f87171; font-size: 15px; display: block; margin-bottom: 6px;">✕ Identity Verification Failed</strong>
          <p style="font-size: 12.5px; color: #cbd5e1; margin: 0; line-height: 1.5;">
            Ninja returned <code>${escapeHtml(body?.status || 'failed')}</code> (${escapeHtml(reasonMsg)}). The loan cannot proceed without verified applicant identity.
          </p>
        </div>
      `;
            showToast('Identity verification failed: ' + reasonMsg, 'error');
        }
    });
}
// -----------------------------------------------------------------------------
// STEP 2: Instant Credit Check & Bureau Risk Scoring
// -----------------------------------------------------------------------------
function bindStep2() {
    const checkBtn = document.getElementById('btn-run-credit-check');
    // Presets
    const presets = {
        clean: { bvn: SANDBOX_CREDIT_BVNS.CLEAN, loan: 500000 },
        default: { bvn: SANDBOX_CREDIT_BVNS.DEFAULTED, loan: 500000 },
        thin: { bvn: SANDBOX_CREDIT_BVNS.NO_HISTORY, loan: 300000 },
        over: { bvn: SANDBOX_CREDIT_BVNS.CLEAN, loan: 2500000 }, // exceeds ₦1.8m limit!
        error: { bvn: SANDBOX_CREDIT_BVNS.ERROR, loan: 500000 },
    };
    const activatePreset = (name) => {
        const config = presets[name];
        state.borrower.bvn = config.bvn;
        state.loanRequest.amountNaira = config.loan;
        state.loanRequest.amountKobo = config.loan * 100;
        saveCreditState(state);
        window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
        syncFields();
        document.querySelectorAll('#view-credit-step-2 .preset-chip').forEach((c) => {
            c.classList.remove('active');
        });
        document.getElementById(`btn-credit-${name}`)?.classList.add('active');
    };
    document.getElementById('btn-credit-clean')?.addEventListener('click', () => activatePreset('clean'));
    document.getElementById('btn-credit-default')?.addEventListener('click', () => activatePreset('default'));
    document.getElementById('btn-credit-thin')?.addEventListener('click', () => activatePreset('thin'));
    document.getElementById('btn-credit-over')?.addEventListener('click', () => activatePreset('over'));
    document.getElementById('btn-credit-error')?.addEventListener('click', () => activatePreset('error'));
    checkBtn?.addEventListener('click', async () => {
        checkBtn.disabled = true;
        checkBtn.innerHTML = `
      <span style="font-size: 16px;">⏳</span>
      <span>Contacting Licensed Credit Bureaus...</span>
    `;
        const targetBvn = state.borrower.bvn || SANDBOX_CREDIT_BVNS.CLEAN;
        const loanKobo = state.loanRequest.amountKobo || 50000000;
        const ref = state.loanRequest.reference || 'loan-app-1042';
        const payload = {
            bvn: targetBvn,
            loan_amount: loanKobo,
            reference: ref,
        };
        const t0 = performance.now();
        let status = 200;
        let body = null;
        try {
            const res = await fetch('/api/credit/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            status = res.status;
            body = await readApiBody(res);
            if (status >= 500 || !body?.status) {
                throw new Error('Fallback to sandbox fixture');
            }
        }
        catch {
            // In-browser sandbox fixture fallback
            const fixture = getSandboxCreditCheck(targetBvn, loanKobo);
            status = fixture.status;
            body = fixture.body;
        }
        const duration = Math.round(performance.now() - t0);
        addLog('Step 2 · Credit Check', 'POST', '/api/credit/check', status, duration, payload, body);
        checkBtn.disabled = false;
        checkBtn.innerHTML = `
      <span style="font-size: 16px;">⚡</span>
      <span>Execute Credit Check (POST /api/credit/check)</span>
      <span style="font-size: 16px;">→</span>
    `;
        if (status !== 200 || !body?.data) {
            renderCreditCheckError(body || { error: 'Unknown bureau response' });
            return;
        }
        const data = body.data;
        const checkStateData = {
            score: data.score,
            band: data.band,
            recommendation: data.recommendation,
            reasons: data.reasons || [],
            eligibleAmountKobo: data.eligible_amount || 0,
            eligibleAmountNaira: Math.round((data.eligible_amount || 0) / 100),
            summary: data.summary ? {
                institutions: data.summary.institutions,
                totalLoans: data.summary.total_loans,
                openLoans: data.summary.open_loans,
                closedLoans: data.summary.closed_loans,
                performingLoans: data.summary.performing_loans,
                nonPerformingLoans: data.summary.non_performing_loans,
                openNonPerformingLoans: data.summary.open_non_performing_loans,
                missedRepayments: data.summary.missed_repayments,
                totalCreditValue: data.summary.total_credit_value,
                highestCredit: data.summary.highest_credit,
                openCreditValue: data.summary.open_credit_value,
            } : null,
            raw: body,
        };
        state.creditCheck = checkStateData;
        saveCreditState(state);
        window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
        renderCreditCheckResults(checkStateData);
        showToast(`Credit check complete: recommendation is ${checkStateData.recommendation?.toUpperCase()}`, 'info');
    });
}
function renderCreditCheckError(body) {
    const resultBox = document.getElementById('credit-step2-result');
    if (!resultBox)
        return;
    resultBox.hidden = false;
    resultBox.innerHTML = `
    <div class="error" style="padding: 18px; border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08);">
      <strong style="color: #f87171; font-size: 15px; display: block; margin-bottom: 6px;">✕ Credit Enquiry Failed</strong>
      <p style="font-size: 12.5px; color: #cbd5e1; margin: 0; line-height: 1.5;">
        ${escapeHtml(body?.message || body?.error || 'The credit bureau was unable to return an answer.')}
      </p>
    </div>
  `;
}
function renderCreditCheckResults(data) {
    const resultBox = document.getElementById('credit-step2-result');
    if (!resultBox)
        return;
    resultBox.hidden = false;
    const score = data.score;
    const band = data.band || 'thin';
    const rec = data.recommendation || 'review';
    const reasons = data.reasons || [];
    const summary = data.summary;
    // Score needle percentage (300 to 850 range)
    let needlePercent = 50;
    if (score !== null && score !== undefined) {
        needlePercent = Math.min(100, Math.max(0, ((score - 300) / (850 - 300)) * 100));
    }
    const bandClass = band ? `band-${band}` : 'band-thin';
    const bandTagClass = band ? `band-tag-${band}` : 'band-tag-fair';
    // Recommendation verdict
    let verdictClass = 'verdict-review';
    let verdictBadge = '⚠ Review Required';
    let verdictText = 'This applicant requires human underwriter review before funding.';
    if (rec === 'approve') {
        verdictClass = 'verdict-approve';
        verdictBadge = '✓ Pre-Approved';
        verdictText = 'Credit history is clean and requested loan is within eligible borrowing capacity.';
    }
    else if (rec === 'deny') {
        verdictClass = 'verdict-deny';
        verdictBadge = '✕ Application Denied';
        verdictText = 'Applicant has open non-performing loans or score is in poor band. Automatic decline.';
    }
    else {
        if (reasons.includes('amount_above_eligible')) {
            verdictText = `The requested loan (${formatNaira(state.loanRequest.amountNaira)}) exceeds the borrower's eligible credit capacity (${formatNaira(data.eligibleAmountNaira)}). Counter-offer recommended.`;
        }
        else if (reasons.includes('no_credit_history')) {
            verdictText = 'First-time borrower with no bureau accounts on record. Review recommended instead of automated decline.';
        }
    }
    // Reason Chips
    const reasonLabels = {
        clean_record: { label: '✓ Clean Repayment Record', type: 'positive' },
        open_non_performing_loan: { label: '✕ Open Default / Non-Performing Loan', type: 'negative' },
        past_non_performing_loan: { label: '⚠ Past Settled Default', type: 'warning' },
        missed_repayments: { label: '⚠ Missed Repayments On Record', type: 'negative' },
        amount_above_eligible: { label: '⚠ Loan Ask Exceeds Eligible Capacity', type: 'warning' },
        no_credit_history: { label: 'ℹ Thin File / First-Time Borrower', type: 'warning' },
    };
    const reasonsHtml = reasons.map((r) => {
        const meta = reasonLabels[r] || { label: r, type: 'warning' };
        return `<span class="reason-chip reason-${meta.type}">${escapeHtml(meta.label)}</span>`;
    }).join('');
    resultBox.innerHTML = `
    <!-- Credit Score Gauge Card -->
    <div class="credit-score-card">
      <div class="credit-score-hero">
        <div>
          <span style="font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">
            Ninja Bureau Risk Score (Scale: 300 &ndash; 850)
          </span>
          <div class="score-main-group">
            <span class="score-number ${bandClass}">${score !== null ? score : 'N/A'}</span>
            <span class="score-band-tag ${bandTagClass}">${band ? band : 'Thin File'}</span>
          </div>
        </div>

        <div style="text-align: right;">
          <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Max Eligible Credit</span>
          <strong style="font-family: var(--font-mono); font-size: 20px; color: #10b981;">
            ${formatNaira(data.eligibleAmountNaira)}
          </strong>
        </div>
      </div>

      <!-- Meter Bar -->
      <div class="score-meter-wrap">
        <div class="score-meter-segments">
          <div class="meter-seg meter-seg-poor" title="300-579: Poor"></div>
          <div class="meter-seg meter-seg-fair" title="580-649: Fair"></div>
          <div class="meter-seg meter-seg-good" title="650-719: Good"></div>
          <div class="meter-seg meter-seg-excellent" title="720-850: Excellent"></div>
          <div class="score-needle" style="left: ${needlePercent}%;"></div>
        </div>
        <div class="score-scale-legend">
          <span>300 (Poor)</span>
          <span>580 (Fair)</span>
          <span>650 (Good)</span>
          <span>720 (Excellent)</span>
          <span>850</span>
        </div>
      </div>

      <!-- Verdict Banner -->
      <div class="verdict-banner ${verdictClass}">
        <div>
          <span class="verdict-badge">${verdictBadge}</span>
          <p class="verdict-text">${escapeHtml(verdictText)}</p>
          <div class="reasons-container" style="margin-top: 8px;">
            ${reasonsHtml}
          </div>
        </div>
        <button type="button" id="btn-goto-step-3" class="preset-chip preset-pass" style="font-weight: 800; padding: 12px 18px; font-size: 13px; flex-shrink: 0;">
          Audit History &amp; Underwrite →
        </button>
      </div>

      <!-- 8-Metric Loan Book Summary Grid -->
      <div style="margin-top: 18px;">
        <span style="font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 8px;">
          Bureau Loan Book In Numbers (Live Aggregation)
        </span>
        <div class="credit-metrics-grid">
          <div class="metric-tile">
            <div class="metric-tile-label">Reporting Institutions</div>
            <div class="metric-tile-value">${summary?.institutions || 0}</div>
          </div>
          <div class="metric-tile">
            <div class="metric-tile-label">Total Loans Recorded</div>
            <div class="metric-tile-value">${summary?.totalLoans || 0}</div>
          </div>
          <div class="metric-tile">
            <div class="metric-tile-label">Open vs Closed</div>
            <div class="metric-tile-value">${summary?.openLoans || 0} Open / ${summary?.closedLoans || 0} Closed</div>
          </div>
          <div class="metric-tile">
            <div class="metric-tile-label">Performance</div>
            <div class="metric-tile-value ${summary?.nonPerformingLoans ? 'val-danger' : 'val-success'}">
              ${summary?.performingLoans || 0} Performing / ${summary?.nonPerformingLoans || 0} Trouble
            </div>
          </div>
          <div class="metric-tile">
            <div class="metric-tile-label">Missed Repayments</div>
            <div class="metric-tile-value ${summary?.missedRepayments ? 'val-danger' : 'val-success'}">
              ${summary?.missedRepayments || 0}
            </div>
          </div>
          <div class="metric-tile">
            <div class="metric-tile-label">Total Credit Value</div>
            <div class="metric-tile-value">${formatKoboToNaira(summary?.totalCreditValue || 0)}</div>
          </div>
          <div class="metric-tile">
            <div class="metric-tile-label">Highest Credit Held</div>
            <div class="metric-tile-value val-highlight">${formatKoboToNaira(summary?.highestCredit || 0)}</div>
          </div>
          <div class="metric-tile">
            <div class="metric-tile-label">Open Outstanding Balance</div>
            <div class="metric-tile-value">${formatKoboToNaira(summary?.openCreditValue || 0)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
    document.getElementById('btn-goto-step-3')?.addEventListener('click', () => {
        goToStep(3);
    });
}
// -----------------------------------------------------------------------------
// STEP 3: Deep Bureau History & Loan Underwriting / Disbursement
// -----------------------------------------------------------------------------
function bindStep3() {
    const pullHistoryBtn = document.getElementById('btn-pull-credit-history');
    pullHistoryBtn?.addEventListener('click', async () => {
        pullHistoryBtn.disabled = true;
        pullHistoryBtn.innerHTML = `
      <span style="font-size: 16px;">⏳</span>
      <span>Pulling Complete Bureau Loan Book...</span>
    `;
        const targetBvn = state.borrower.bvn || SANDBOX_CREDIT_BVNS.CLEAN;
        const loanKobo = state.loanRequest.amountKobo || 50000000;
        const ref = state.loanRequest.reference || 'loan-app-1042';
        const payload = {
            bvn: targetBvn,
            loan_amount: loanKobo,
            reference: ref,
        };
        const t0 = performance.now();
        let status = 200;
        let body = null;
        try {
            const res = await fetch('/api/credit/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            status = res.status;
            body = await readApiBody(res);
            if (status >= 500 || !body?.data) {
                throw new Error('Fallback to sandbox fixture');
            }
        }
        catch {
            const fixture = getSandboxCreditHistory(targetBvn, loanKobo);
            status = fixture.status;
            body = fixture.body;
        }
        const duration = Math.round(performance.now() - t0);
        addLog('Step 3 · Bureau History', 'POST', '/api/credit/history', status, duration, payload, body);
        pullHistoryBtn.disabled = false;
        pullHistoryBtn.innerHTML = `
      <span style="font-size: 16px;">📋</span>
      <span>Pull Complete Bureau History (POST /api/credit/history)</span>
      <span style="font-size: 16px;">→</span>
    `;
        if (status !== 200 || !body?.data) {
            showToast('Could not fetch credit history record', 'error');
            return;
        }
        const data = body.data;
        const historyData = {
            profile: data.profile || null,
            accounts: data.accounts || [],
            raw: body,
        };
        state.creditHistory = historyData;
        saveCreditState(state);
        window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
        renderCreditHistoryResults(historyData);
        showToast('Complete bureau loan accounts loaded!', 'success');
    });
}
function renderCreditHistoryResults(data) {
    const container = document.getElementById('credit-step3-history-container');
    const disbBox = document.getElementById('credit-step3-disbursement-box');
    if (!container)
        return;
    container.hidden = false;
    const profile = data.profile;
    const accounts = data.accounts || [];
    // Bureau Profile Card
    let profileHtml = '';
    if (profile) {
        const addressList = (profile.address_history || []).map((a) => `
      <div style="font-size: 11.5px; margin-bottom: 4px;">
        <span style="color: #64748b;">${escapeHtml(a.type || 'Residential')}:</span>
        <strong style="color: #cbd5e1;">${escapeHtml(a.address)}</strong>
        <span style="color: #64748b; font-size: 10.5px;">(Reported ${escapeHtml(a.date_reported || '')})</span>
      </div>
    `).join('');
        profileHtml = `
      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="color: #ffffff; font-size: 14px;">Bureau Profile &amp; Address History</strong>
          <span style="font-size: 11px; color: #10b981; font-weight: 700;">Verified Bureau Record</span>
        </div>
        <div style="display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 10px;">
          <div><span style="color: #64748b; font-size: 11px;">Full Name:</span> <strong style="color: #fff; font-size: 13px;">${escapeHtml(profile.full_name)}</strong></div>
          <div><span style="color: #64748b; font-size: 11px;">Gender:</span> <strong style="color: #fff; font-size: 13px;">${escapeHtml(profile.gender)}</strong></div>
          <div><span style="color: #64748b; font-size: 11px;">BVN:</span> <strong style="color: #fff; font-size: 13px; font-family: var(--font-mono);">${escapeHtml(profile.identifications?.[0]?.number || state.borrower.bvn)}</strong></div>
        </div>
        <div>${addressList}</div>
      </div>
    `;
    }
    // Accounts List
    let accountsHtml = '';
    if (accounts.length === 0) {
        accountsHtml = `
      <div style="padding: 24px; text-align: center; color: #94a3b8; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06);">
        No prior loan accounts reported by bureaus. Thin file first-time applicant.
      </div>
    `;
    }
    else {
        accountsHtml = accounts.map((inst) => {
            const loansHtml = (inst.loans || []).map((loan) => {
                const isOpen = loan.status === 'open';
                const isPerf = loan.performance === 'performing';
                const statusClass = isOpen ? 'status-open' : 'status-closed';
                const perfClass = isPerf ? 'perf-performing' : 'perf-lost';
                // Repayment pills
                const schedulePills = (loan.repayment_schedule || []).map((r) => {
                    const pillClass = r.status === 'paid' ? 'pill-paid' : r.status === 'pending' ? 'pill-pending' : 'pill-missed';
                    const icon = r.status === 'paid' ? '✓' : r.status === 'pending' ? '⏳' : '✕';
                    return `<span class="repayment-pill ${pillClass}">${icon} ${escapeHtml(r.period)}: ${escapeHtml(r.status)}</span>`;
                }).join('');
                return `
          <div class="bureau-account-card">
            <div class="account-card-header">
              <span class="account-institution-name">
                <i class="ph-bold ph-bank" style="color: #38bdf8;"></i>
                ${escapeHtml(inst.institution)}
              </span>
              <div class="account-status-badges">
                <span class="status-badge ${statusClass}">${escapeHtml(loan.status)}</span>
                <span class="status-badge ${perfClass}">${escapeHtml(loan.performance)}</span>
              </div>
            </div>

            <div class="account-details-grid">
              <div class="account-detail-item">
                <span class="account-detail-key">Opening Balance</span>
                <span class="account-detail-val">${formatKoboToNaira(loan.opening_balance)}</span>
              </div>
              <div class="account-detail-item">
                <span class="account-detail-key">Monthly Repayment</span>
                <span class="account-detail-val">${formatKoboToNaira(loan.repayment_amount)}</span>
              </div>
              <div class="account-detail-item">
                <span class="account-detail-key">Tenor &amp; Frequency</span>
                <span class="account-detail-val">${loan.tenor} mos (${loan.repayment_frequency})</span>
              </div>
              <div class="account-detail-item">
                <span class="account-detail-key">Opened Date</span>
                <span class="account-detail-val">${escapeHtml(loan.date_opened)}</span>
              </div>
            </div>

            <!-- Month by Month Timeline -->
            <div class="repayment-timeline">
              <div class="repayment-timeline-title">Repayment Schedule Track Record:</div>
              <div class="repayment-pills-row">
                ${schedulePills || '<span style="color: #64748b; font-size: 11px;">No schedule breakdown</span>'}
              </div>
            </div>
          </div>
        `;
            }).join('');
            return loansHtml;
        }).join('');
    }
    container.innerHTML = `
    <div style="margin-top: 20px;">
      <h3 style="font-size: 16px; font-weight: 800; color: #fff; margin-bottom: 12px;">Bureau Underwriting Audit</h3>
      ${profileHtml}
      <h4 style="font-size: 13px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 10px;">Lender-by-Lender Account Breakdown</h4>
      ${accountsHtml}
    </div>
  `;
    // Underwriting & Disbursement Console
    if (!disbBox)
        return;
    disbBox.hidden = false;
    const rec = state.creditCheck?.recommendation || 'review';
    const isApproved = rec === 'approve';
    const isDeny = rec === 'deny';
    const loanNaira = state.loanRequest.amountNaira;
    const tenor = state.loanRequest.tenorMonths;
    if (isApproved) {
        const monthlyInstallment = Math.round((loanNaira * 1.18) / tenor);
        disbBox.innerHTML = `
      <div class="disbursement-receipt">
        <div class="receipt-header">
          <div class="receipt-title">
            <i class="ph-bold ph-seal-check"></i>
            Approved for Immediate Disbursement
          </div>
          <span class="status-badge perf-performing" style="font-size: 12px; padding: 4px 10px;">Pre-Approved</span>
        </div>

        <div style="margin-bottom: 16px;">
          <div class="receipt-row">
            <span class="receipt-label">Borrower Name</span>
            <span class="receipt-value">${escapeHtml(state.borrower.firstName)} ${escapeHtml(state.borrower.lastName)}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Approved Principal</span>
            <span class="receipt-value" style="color: #10b981; font-size: 15px;">${formatNaira(loanNaira)}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Interest Rate</span>
            <span class="receipt-value">3.0% / month flat</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Repayment Tenor</span>
            <span class="receipt-value">${tenor} Monthly Payments</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Monthly Installment</span>
            <span class="receipt-value">${formatNaira(monthlyInstallment)}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Disbursement Destination</span>
            <span class="receipt-value">Access Bank &middot; 0123456789</span>
          </div>
        </div>

        <button type="button" id="btn-execute-disbursement" style="background: #10b981; color: #021a0e; font-size: 15px; font-weight: 800; padding: 14px; width: 100%; border: none; cursor: pointer;">
          💸 Disburse ${formatNaira(loanNaira)} via Instant Bank Transfer →
        </button>

        <div id="disbursement-final-receipt" style="margin-top: 16px;" hidden></div>
      </div>
    `;
        document.getElementById('btn-execute-disbursement')?.addEventListener('click', () => {
            const receiptContainer = document.getElementById('disbursement-final-receipt');
            const btn = document.getElementById('btn-execute-disbursement');
            if (btn)
                btn.disabled = true;
            confetti({
                particleCount: 80,
                spread: 60,
                origin: { y: 0.6 },
            });
            const txRef = 'NIP-' + Math.floor(100000000000 + Math.random() * 900000000000);
            const now = new Date().toISOString();
            state.disbursement = {
                status: 'disbursed',
                transactionRef: txRef,
                timestamp: now,
                accountNumber: '0123456789',
                bankName: 'Access Bank PLC',
            };
            saveCreditState(state);
            window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
            addLog('Loan Disbursement', 'POST', '/api/disbursement/transfer', 200, 45, {
                bvn: state.borrower.bvn,
                amount: loanNaira * 100,
                account_number: '0123456789',
                bank_code: '044',
                reference: txRef,
            }, {
                status: 'success',
                transaction_id: txRef,
                amount: loanNaira * 100,
                recipient: `${state.borrower.firstName} ${state.borrower.lastName}`,
                completed_at: now,
            });
            if (receiptContainer) {
                receiptContainer.hidden = false;
                receiptContainer.innerHTML = `
          <div style="background: #021a0e; border: 1px solid #10b981; padding: 16px; margin-top: 14px;">
            <strong style="color: #10b981; font-size: 14px; display: block; margin-bottom: 6px;">
              ✓ Funds Successfully Disbursed!
            </strong>
            <p style="font-size: 12px; color: #cbd5e1; margin: 0 0 10px;">
              Instant NIP session credited to Access Bank 0123456789. Audit reference: <code>${txRef}</code>.
            </p>
            <span style="font-size: 11px; color: #64748b;">Disbursed at ${new Date().toLocaleString()}</span>
          </div>
        `;
            }
            showToast(`Disbursed ${formatNaira(loanNaira)} successfully!`, 'success');
        });
    }
    else if (isDeny) {
        disbBox.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); padding: 22px;">
        <strong style="color: #f87171; font-size: 16px; display: block; margin-bottom: 8px;">
          ✕ Loan Application Declined
        </strong>
        <p style="font-size: 12.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 12px;">
          Per statutory guidelines under the Nigerian Credit Reporting Act, this loan cannot be funded due to open non-performing loans or adverse repayment history reported by licensed bureaus.
        </p>
        <span style="font-size: 11px; color: #94a3b8; font-family: var(--font-mono);">
          Adverse Action Code: CRA-DEF-04 &middot; Reference: ${escapeHtml(state.loanRequest.reference)}
        </span>
      </div>
    `;
    }
    else {
        // Review
        const eligibleNaira = state.creditCheck?.eligibleAmountNaira || 0;
        disbBox.innerHTML = `
      <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); padding: 22px;">
        <strong style="color: #fbbf24; font-size: 16px; display: block; margin-bottom: 8px;">
          ⚠ Manual Underwriter Review Required
        </strong>
        <p style="font-size: 12.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px;">
          This applicant cannot be auto-approved without committee review. Suggested underwriter actions:
        </p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${eligibleNaira > 0 ? `
            <button type="button" id="btn-counter-offer" class="preset-chip preset-pass" style="padding: 10px 14px; font-weight: 800;">
              Counter-Offer Cap at ${formatNaira(eligibleNaira)} →
            </button>
          ` : ''}
          <button type="button" id="btn-guarantor" class="preset-chip preset-warn" style="padding: 10px 14px; font-weight: 800;">
            Request Verified Guarantor →
          </button>
        </div>
      </div>
    `;
        document.getElementById('btn-counter-offer')?.addEventListener('click', () => {
            state.loanRequest.amountNaira = eligibleNaira;
            state.loanRequest.amountKobo = eligibleNaira * 100;
            saveCreditState(state);
            window.dispatchEvent(new CustomEvent('ninjacredit:state-updated', { detail: { state } }));
            showToast(`Counter-offered loan capped at ${formatNaira(eligibleNaira)}`, 'info');
            renderCreditHistoryResults(data);
        });
        document.getElementById('btn-guarantor')?.addEventListener('click', () => {
            showToast('Guarantor verification link dispatched to applicant.', 'info');
        });
    }
}
// -----------------------------------------------------------------------------
// Telemetry Workbench & API Call Log
// -----------------------------------------------------------------------------
function bindDevTools() {
    document.getElementById('btn-credit-clear-logs')?.addEventListener('click', () => {
        state.logs = [];
        renderLogs();
        showToast('API log cleared', 'info');
    });
}
function addLog(step, method, endpoint, status, durationMs, request, response) {
    const log = {
        id: 'log_' + Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        step,
        method,
        endpoint,
        status,
        durationMs,
        request,
        response,
    };
    state.logs.unshift(log);
    if (state.logs.length > 25)
        state.logs.pop();
    renderLogs(log.id);
}
const logActiveLang = {};
function isOkStatus(status) {
    return status >= 200 && status < 300;
}
function getTagClass(step) {
    const s = String(step || '');
    if (s.includes('Step 1'))
        return 'tag-step-1';
    if (s.includes('Step 2'))
        return 'tag-step-2';
    if (s.includes('Step 3'))
        return 'tag-step-3';
    if (s.includes('Disbursement') || s.includes('Payout') || s.includes('Transfer'))
        return 'tag-payout';
    return 'tag-step-1';
}
function generateCodeSnippets(method, endpoint, payload) {
    const url = `https://api.ninja.ng${endpoint}`;
    const jsonStr = JSON.stringify(payload || {}, null, 2);
    const jsonStr4 = JSON.stringify(payload || {}, null, 4);
    const curl = `curl -X ${method} "${url}" \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${jsonStr}'`;
    const javascript = `const response = await fetch("${url}", {
  method: "${method}",
  headers: {
    "Authorization": \`Bearer \${process.env.NINJA_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${jsonStr}),
});
const data = await response.json();
console.log(data);`;
    const python = `import os
import requests

response = requests.${method.toLowerCase()}(
    "${url}",
    headers={
        "Authorization": f"Bearer {os.environ.get('NINJA_TOKEN')}",
        "Content-Type": "application/json",
    },
    json=${jsonStr4}
)
data = response.json()
print(data)`;
    const go = `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	payloadBytes := []byte(\`${jsonStr}\`)
	req, _ := http.NewRequest("${method}", "${url}", bytes.NewBuffer(payloadBytes))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("NINJA_TOKEN"))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	fmt.Println("Response Status:", resp.Status)
}`;
    const rust = `use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let token = std::env::var("NINJA_TOKEN").unwrap_or_default();

    let res = client
        .${method.toLowerCase()}("${url}")
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!(${jsonStr4}))
        .send()
        .await?;

    let body = res.text().await?;
    println!("Response: {}", body);
    Ok(())
}`;
    return {
        curl: { lang: 'bash', code: curl },
        javascript: { lang: 'javascript', code: javascript },
        python: { lang: 'python', code: python },
        go: { lang: 'go', code: go },
        rust: { lang: 'rust', code: rust },
    };
}
function renderLogs(openLogId) {
    const container = document.getElementById('credit-call-log-list');
    if (!container)
        return;
    if (state.logs.length === 0) {
        container.innerHTML = `
      <div style="font-size: 11.5px; color: var(--muted); text-align: center; padding: 24px;" id="credit-empty-logs-label">
        No API calls made yet. Click any button on the left to trigger a live call.
      </div>
    `;
        return;
    }
    container.innerHTML = state.logs
        .map((log, index) => {
        const isOpen = openLogId ? log.id === openLogId : index === 0;
        const activeLang = logActiveLang[log.id] || 'curl';
        const snippets = generateCodeSnippets(log.method, log.endpoint, log.request);
        const currentSnippet = snippets[activeLang] || snippets.curl;
        const highlightedCode = Prism.highlight(currentSnippet.code, Prism.languages[currentSnippet.lang] || Prism.languages.javascript, currentSnippet.lang);
        return `
        <div class="api-log-entry ${isOpen ? 'open' : ''}" data-log-id="${log.id}">
          <div class="api-log-header">
            <div class="api-log-header-left">
              <span class="api-log-step-tag ${getTagClass(log.step)}">${escapeHtml(log.step)}</span>
              <span class="api-log-method">${log.method}</span>
              <code class="api-log-path" title="${escapeHtml(log.endpoint)}">${escapeHtml(log.endpoint)}</code>
            </div>
            <div class="api-log-meta">
              <span class="api-log-time">${log.durationMs}ms</span>
              <span class="api-log-status ${isOkStatus(log.status) ? 'api-log-status-ok' : 'api-log-status-error'}">${log.status}</span>
              <span class="api-log-chevron">▼</span>
            </div>
          </div>
          <div class="api-log-details" ${isOpen ? '' : 'hidden'}>
            <!-- Multi-language code snippet box with tabs & copy button -->
            <div class="api-log-code-box">
              <div class="api-log-toolbar">
                <div class="api-log-lang-tabs" data-log-id="${log.id}">
                  <button type="button" class="api-log-lang-tab ${activeLang === 'curl' ? 'active' : ''}" data-lang="curl">cURL</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'javascript' ? 'active' : ''}" data-lang="javascript">JavaScript</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'python' ? 'active' : ''}" data-lang="python">Python</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'go' ? 'active' : ''}" data-lang="go">Go</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'rust' ? 'active' : ''}" data-lang="rust">Rust</button>
                </div>
                <button type="button" class="btn-copy-log-snippet" data-log-id="${log.id}" title="Copy snippet">
                  <span class="copy-text">📋 Copy Code</span>
                </button>
              </div>
              <pre class="api-log-snippet-pre language-${currentSnippet.lang}"><code class="api-log-snippet-code language-${currentSnippet.lang}">${highlightedCode}</code></pre>
            </div>

            <!-- Payloads Grid: Request and Response -->
            <div class="api-log-payloads-grid">
              <div class="api-log-section">
                <div class="api-log-section-label">
                  <span>Request Payload</span>
                  <span class="label-method">${log.method} ${escapeHtml(log.endpoint)}</span>
                </div>
                <pre class="api-log-code"><code>${escapeHtml(JSON.stringify(log.request, null, 2))}</code></pre>
              </div>
              <div class="api-log-section">
                <div class="api-log-section-label">
                  <span>Server Response</span>
                  <span style="color: ${isOkStatus(log.status) ? '#34d399' : '#f87171'}; font-family: var(--font-mono); font-weight: 800;">${log.status} ${isOkStatus(log.status) ? 'OK' : 'REJECT'}</span>
                </div>
                <pre class="api-log-code"><code>${escapeHtml(JSON.stringify(log.response, null, 2))}</code></pre>
              </div>
            </div>
          </div>
        </div>
      `;
    })
        .join('');
    // Accordion click
    container.querySelectorAll('.api-log-header').forEach((hdr) => {
        hdr.addEventListener('click', () => {
            const entry = hdr.closest('.api-log-entry');
            if (!entry)
                return;
            const details = entry.querySelector('.api-log-details');
            const isOpen = entry.classList.contains('open');
            if (isOpen) {
                entry.classList.remove('open');
                if (details)
                    details.hidden = true;
            }
            else {
                entry.classList.add('open');
                if (details)
                    details.hidden = false;
            }
        });
    });
    // Language tab switching
    container.querySelectorAll('.api-log-lang-tab').forEach((tabBtn) => {
        tabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const newLang = btn.dataset.lang || 'curl';
            const logId = btn.closest('.api-log-entry')?.getAttribute('data-log-id');
            if (logId) {
                logActiveLang[logId] = newLang;
                const entry = container.querySelector(`.api-log-entry[data-log-id="${logId}"]`);
                if (entry) {
                    const logItem = state.logs.find((item) => item.id === logId);
                    if (logItem) {
                        const snippets = generateCodeSnippets(logItem.method, logItem.endpoint, logItem.request);
                        const currentSnippet = snippets[newLang] || snippets.curl;
                        const preEl = entry.querySelector('.api-log-snippet-pre');
                        const codeEl = entry.querySelector('.api-log-snippet-code');
                        if (preEl && codeEl) {
                            preEl.className = `api-log-snippet-pre language-${currentSnippet.lang}`;
                            codeEl.className = `api-log-snippet-code language-${currentSnippet.lang}`;
                            codeEl.innerHTML = Prism.highlight(currentSnippet.code, Prism.languages[currentSnippet.lang] || Prism.languages.javascript, currentSnippet.lang);
                        }
                        entry.querySelectorAll('.api-log-lang-tab').forEach((b) => {
                            if (b.dataset.lang === newLang) {
                                b.classList.add('active');
                            }
                            else {
                                b.classList.remove('active');
                            }
                        });
                    }
                }
            }
        });
    });
    // Copy code snippet
    container.querySelectorAll('.btn-copy-log-snippet').forEach((copyBtn) => {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const logId = btn.getAttribute('data-log-id');
            if (!logId)
                return;
            const logItem = state.logs.find((item) => item.id === logId);
            if (!logItem)
                return;
            const activeLang = logActiveLang[logId] || 'curl';
            const snippets = generateCodeSnippets(logItem.method, logItem.endpoint, logItem.request);
            const currentSnippet = snippets[activeLang] || snippets.curl;
            const copyTextEl = btn.querySelector('.copy-text');
            navigator.clipboard
                .writeText(currentSnippet.code)
                .then(() => {
                btn.classList.add('copied');
                if (copyTextEl)
                    copyTextEl.textContent = '✓ Copied!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    if (copyTextEl)
                        copyTextEl.textContent = '📋 Copy Code';
                }, 1800);
            })
                .catch(() => {
                btn.classList.add('copied');
                if (copyTextEl)
                    copyTextEl.textContent = '✓ Copied!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    if (copyTextEl)
                        copyTextEl.textContent = '📋 Copy Code';
                }, 1800);
            });
        });
    });
}
async function readApiBody(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    }
    catch {
        return { raw: text };
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
}
else {
    init();
}

export { showToast };
