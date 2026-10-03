import confetti from './vendor/canvas-confetti/dist/confetti.module.js';
import Prism from './vendor/prismjs/prism.js';
import './vendor/prismjs/components/prism-go.js';
import './vendor/prismjs/components/prism-bash.js';
import './vendor/prismjs/components/prism-python.js';
import './vendor/prismjs/components/prism-rust.js';
import { loadState, saveState } from './lib/state.js';
import { showCodeFirstSlideOut } from './lib/codeModal.js';
import { getFlowCreationConfig, getLinkScenarioConfig } from './lib/linkScenarios.js';

// =============================================================================
// ninja-bet: Interactive Integration Guide & Telemetry Workbench
// =============================================================================
let state = loadState();
let activeTab = 'curl';
let selectedScenario = 'prefilled';
let step3Subtab = 'mint';
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
function init() {
    // Ensure the API Call & Response Log section is ALWAYS completely empty on landing!
    state.logs = [];
    // Ensure player name is never set before registration is completed!
    if (!state.player || state.player.kycStatus !== 'verified') {
        state.player.firstName = '';
        state.player.lastName = '';
        state.player.phoneNumber = '';
        state.player.nin = '';
        state.player.dateOfBirth = '';
        state.player.kycStatus = 'unverified';
        state.player.walletBalanceNaira = 0;
        state.player.withdrawableBalanceNaira = 0;
    }
    bindStepper();
    bindSimulationWallet();
    bindStep1();
    bindStep2();
    bindStep3();
    bindDevTools();
    bindCopyCode();
    // Navigation listener
    window.addEventListener('ninjabet:navigate-step', (e) => {
        if (e.detail?.step) {
            goToStep(e.detail.step);
        }
    });
    // Back from Ninja's hosted check (?vs_id=...&status=...): open Step 3 and show that result.
    const returned = new URLSearchParams(window.location.search);
    const returnedId = returned.get('vs_id');
    if (returnedId)
        state.currentStep = 3;
    goToStep(state.currentStep);
    syncFields();
    renderLogs();
    updateDevCode();
    if (returnedId)
        showReturnedVerification(returnedId, returned.get('status'));
}
// Ninja redirects to redirect_url?vs_id=...&status=... after the hosted check.
// The status in the URL is only a hint; the real result comes from the same
// status + webhook checks used while waiting.
function showReturnedVerification(verificationId, status) {
    history.replaceState(null, '', window.location.pathname);
    activeVerification = { id: verificationId, url: '' };
    startVerificationPolling(verificationId);
    pollVerificationOnce(verificationId);
    const note = document.getElementById('step3-return-note');
    if (note) {
        note.hidden = false;
        note.textContent = `You're back from the hosted check${status ? ` (Ninja reported: ${status})` : ''}. Result for ${verificationId} below.`;
    }
    document.getElementById('step3-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
// -----------------------------------------------------------------------------
// Stepper & Step Transitions (Sportsbook KYC)
// -----------------------------------------------------------------------------
function goToStep(step) {
    state.currentStep = step;
    saveState(state);
    window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
    const v1 = document.getElementById('view-step-1');
    const v2 = document.getElementById('view-step-2');
    const v3 = document.getElementById('view-step-3');
    const subtabs = document.getElementById('step3-code-subtabs');
    if (v1)
        v1.hidden = step !== 1;
    if (v2)
        v2.hidden = step !== 2;
    if (v3)
        v3.hidden = step !== 3;
    if (subtabs)
        subtabs.hidden = step !== 3;
    updateDevCode();
}
function bindStepper() {
    [1, 2, 3].forEach((s) => {
        document.getElementById(`step-nav-${s}`)?.addEventListener('click', () => {
            goToStep(s);
        });
    });
}
function syncFields() {
    const fn = document.getElementById('input-first-name');
    const ln = document.getElementById('input-last-name');
    const phone = document.getElementById('input-phone');
    const nin = document.getElementById('input-nin');
    const dob = document.getElementById('input-dob');
    const wallet = document.getElementById('sim-wallet-input');
    const holderInput = document.getElementById('input-holder-name');
    if (fn)
        fn.value = state.player.firstName;
    if (ln)
        ln.value = state.player.lastName;
    if (phone)
        phone.value = state.player.phoneNumber;
    if (nin)
        nin.value = state.player.nin;
    if (dob)
        dob.value = state.player.dateOfBirth;
    if (wallet)
        wallet.value = String(state.player.walletBalanceNaira);
    const isVerified = state.player && state.player.kycStatus === 'verified';
    const fullName = isVerified ? `${state.player.firstName} ${state.player.lastName}`.trim() : '';
    // Step 2 holder name
    if (holderInput && isVerified && !holderInput.value) {
        holderInput.value = fullName;
    }
    // Step 2 label
    const c2Label = document.getElementById('c2-player-label');
    if (c2Label) {
        c2Label.textContent = isVerified ? fullName : '— (Pending Step 1 Registration)';
    }
    // Step 3 summary
    const c3Bank = document.getElementById('c3-bank-summary');
    const c3Amt = document.getElementById('c3-amount-summary');
    if (c3Bank) {
        if (state.bankAccount && state.bankAccount.isVerified) {
            c3Bank.textContent = `${state.bankAccount.bankName} · ${state.bankAccount.accountNumber} (${fullName})`;
        }
        else if (isVerified) {
            c3Bank.textContent = `Access Bank · 0123456789 (${fullName})`;
        }
        else {
            c3Bank.textContent = 'Access Bank · 0123456789 (Pending Registration)';
        }
    }
    if (c3Amt) {
        c3Amt.textContent = formatNaira(state.player.walletBalanceNaira);
    }
}
function bindSimulationWallet() {
    const walletInput = document.getElementById('sim-wallet-input');
    const btn250k = document.getElementById('btn-param-250k');
    const btn50k = document.getElementById('btn-param-50k');
    const btn10k = document.getElementById('btn-param-10k');
    const presetBtns = [btn250k, btn50k, btn10k];
    function setAmount(amount) {
        state.player.walletBalanceNaira = amount;
        state.withdrawal.amountNaira = amount;
        saveState(state);
        syncFields();
        window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
        presetBtns.forEach((b) => {
            if (!b)
                return;
            const amt = Number(b.dataset.amount);
            if (amt === amount) {
                b.classList.add('active');
            }
            else {
                b.classList.remove('active');
            }
        });
    }
    btn250k?.addEventListener('click', () => setAmount(250000));
    btn50k?.addEventListener('click', () => setAmount(50000));
    btn10k?.addEventListener('click', () => setAmount(10000));
    walletInput?.addEventListener('input', () => {
        const val = parseInt(walletInput.value, 10) || 0;
        state.player.walletBalanceNaira = val;
        state.withdrawal.amountNaira = val;
        saveState(state);
        window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
        presetBtns.forEach((b) => b?.classList.remove('active'));
    });
}
// -----------------------------------------------------------------------------
// Step 1: Sign Up & NIN Check
// -----------------------------------------------------------------------------
function bindStep1() {
    const form = document.getElementById('form-step-1');
    const fn = document.getElementById('input-first-name');
    const ln = document.getElementById('input-last-name');
    const phone = document.getElementById('input-phone');
    const nin = document.getElementById('input-nin');
    const dob = document.getElementById('input-dob');
    const result = document.getElementById('step1-result');
    // Presets
    document.getElementById('btn-preset-adult')?.addEventListener('click', () => {
        if (fn)
            fn.value = 'James';
        if (ln)
            ln.value = 'Bond';
        if (phone)
            phone.value = '08012345678';
        if (nin)
            nin.value = '77777777777';
        if (dob)
            dob.value = '1975-01-01';
        if (result)
            result.hidden = true;
        updateDevCode();
    });
    document.getElementById('btn-preset-mismatch')?.addEventListener('click', () => {
        if (fn)
            fn.value = 'Chinedu';
        if (ln)
            ln.value = 'Okafor';
        if (phone)
            phone.value = '08098765432';
        if (nin)
            nin.value = '77777777777';
        if (dob)
            dob.value = '1985-05-12';
        if (result)
            result.hidden = true;
        updateDevCode();
    });
    document.getElementById('btn-preset-underage')?.addEventListener('click', () => {
        if (fn)
            fn.value = 'Tobi';
        if (ln)
            ln.value = 'Minor';
        if (phone)
            phone.value = '08011223344';
        if (nin)
            nin.value = '77777777777';
        if (dob)
            dob.value = '2010-06-15';
        if (result)
            result.hidden = true;
        updateDevCode();
    });
    // Submit -> Code-First Slide-Out
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const firstName = fn?.value.trim() || '';
        const lastName = ln?.value.trim() || '';
        const phoneNum = phone?.value.trim() || '';
        const ninNum = nin?.value.trim() || '';
        const dobVal = dob?.value.trim() || '';
        if (!firstName || !lastName || !ninNum || !dobVal) {
            alert('Please fill out the registration fields or click one of the 1-Click Test Scenarios above!');
            return;
        }
        const payload = {
            idType: 'nin',
            mode: 'verify',
            idNumber: ninNum,
            firstName: firstName,
            lastName: lastName,
            dateOfBirth: dobVal,
        };
        const curl = `curl -X POST https://api.ninja.ng/api/identity/identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
        const ts = `// Step 1: Verify NIN, Name, and Age in one simple API call
const result = await ninja.identity.identify({
  idType: 'nin',
  mode: 'verify',
  idNumber: '${ninNum}',
  firstName: '${firstName}',
  lastName: '${lastName}',
  dateOfBirth: '${dobVal}',
})

// The 18+ rule is ours: check the date of birth before calling Ninja.
if (result.verified && result.recommendation === 'accept') {
  console.log('Player verified!', result.score)
} else {
  console.log('Rejected:', result.mismatches ?? 'no record found')
}`;
        const python = `# Step 1: Verify NIN, Name, and Age
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(payload, null, 4)}
)`;
        const go = `// Step 1: Verify NIN, Name, and Age
resp, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	IDType:      "nin",
	Mode:        "verify",
	IDNumber:    "${ninNum}",
	FirstName:   "${firstName}",
	LastName:    "${lastName}",
	DateOfBirth: "${dobVal}",
})`;
        const rust = `// Step 1: Verify NIN, Name, and Age
let res = client
    .post("https://api.ninja.ng/api/identity/identify")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`;
        showCodeFirstSlideOut({
            title: 'POST /api/identity/identify',
            endpoint: '/api/identity/identify',
            method: 'POST',
            description: 'Ninja checks government records to verify player name, NIN authenticity, and 18+ age requirement.',
            curl,
            ts,
            python,
            go,
            rust,
            confirmLabel: 'Noted, Proceed →',
            onProceed: async () => {
                await executeStep1({ firstName, lastName, phoneNum, ninNum, dobVal, payload });
            },
        });
    });
}
async function executeStep1(p) {
    const result = document.getElementById('step1-result');
    if (!result)
        return;
    const age = calculateAge(p.dobVal);
    // The 18+ rule is the betting app's own policy, checked before calling Ninja.
    if (age < 18) {
        result.hidden = false;
        result.innerHTML = `
      <div class="error" style="padding: 14px; border-radius: 0;">
        <strong>✗ Player Under 18 (Compliance Block)</strong><br/>
        Birth date indicates age <strong>${age}</strong>. Players under 18 cannot create an account per gaming regulations.
        Blocked by our own rule before calling Ninja, so no identity check was spent.
      </div>
    `;
        return;
    }
    const { status, body } = await identify('Step 1 · Signup', p.payload);
    if (isOkStatus(status) && body.verified === true) {
        state.player.firstName = p.firstName;
        state.player.lastName = p.lastName;
        state.player.phoneNumber = p.phoneNum;
        state.player.nin = p.ninNum;
        state.player.dateOfBirth = p.dobVal;
        state.player.age = age;
        state.player.kycStatus = 'verified';
        state.player.matchScore = typeof body.score === 'number' ? body.score : 1;
        state.player.walletBalanceNaira = state.player.walletBalanceNaira || 250000;
        state.player.withdrawableBalanceNaira = state.player.walletBalanceNaira || 250000;
        state.withdrawal.amountNaira = state.player.walletBalanceNaira || 250000;
        saveState(state);
        syncFields();
        window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
        result.hidden = false;
        result.innerHTML = `
      <div class="success" style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 0;">
        <div>
          <strong>✓ NIN Verified by Ninja (score ${formatScore(body.score)}, ${escapeHtml(String(body.recommendation || 'accept'))})</strong><br/>
          Government record matches <strong>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</strong> (${age} yrs).
        </div>
        <button type="button" id="btn-next-step2" style="background: #10b981; color: #021a0e; font-weight: 800; padding: 12px; margin-top: 4px;">
          Continue to Step 2: Add Bank Account →
        </button>
      </div>
    `;
        document.getElementById('btn-next-step2')?.addEventListener('click', () => {
            goToStep(2);
            syncFields();
        });
    }
    else {
        result.hidden = false;
        result.innerHTML = identifyFailureHtml('✗ Identity Check Failed', 'NIN', p.ninNum, status, body);
    }
}
// -----------------------------------------------------------------------------
// Step 2: Add Bank Details (BVN Check)
// -----------------------------------------------------------------------------
function bindStep2() {
    const form = document.getElementById('form-step-2');
    const bank = document.getElementById('input-bank-name');
    const acc = document.getElementById('input-acc-num');
    const bvn = document.getElementById('input-bvn');
    const holder = document.getElementById('input-holder-name');
    const result = document.getElementById('step2-result');
    // Presets
    document.getElementById('btn-preset-bvn-match')?.addEventListener('click', () => {
        if (bank)
            bank.value = 'Access Bank';
        if (acc)
            acc.value = '0123456789';
        if (bvn)
            bvn.value = '77777777777';
        if (holder)
            holder.value = `${state.player.firstName} ${state.player.lastName}`;
        if (result)
            result.hidden = true;
        updateDevCode();
    });
    document.getElementById('btn-preset-bvn-mismatch')?.addEventListener('click', () => {
        if (bank)
            bank.value = 'GTBank';
        if (acc)
            acc.value = '0987654321';
        if (bvn)
            bvn.value = '66666666666';
        if (holder)
            holder.value = 'Emeka Ugo';
        if (result)
            result.hidden = true;
        updateDevCode();
    });
    // Submit -> Code-First Slide-Out
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const bankName = bank?.value || 'Access Bank';
        const accNum = acc?.value.trim() || '0123456789';
        const bvnNum = bvn?.value.trim() || '77777777777';
        const holderName = holder?.value.trim() || 'James Bond';
        const payload = {
            idType: 'bvn',
            mode: 'verify',
            idNumber: bvnNum,
            firstName: state.player.firstName,
            lastName: state.player.lastName,
        };
        const curl = `curl -X POST https://api.ninja.ng/api/identity/identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
        const ts = `// Step 2: Validate BVN ownership against registered player
const check = await ninja.identity.identify({
  idType: 'bvn',
  mode: 'verify',
  idNumber: '${bvnNum}',
  firstName: '${state.player.firstName}',
  lastName: '${state.player.lastName}',
})

if (check.verified) {
  console.log('Bank account verified and safely bound to player!')
}`;
        const python = `# Step 2: Verify BVN Ownership
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(payload, null, 4)}
)`;
        const go = `// Step 2: Verify BVN Ownership
resp, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	IDType:    "bvn",
	Mode:      "verify",
	IDNumber:  "${bvnNum}",
	FirstName: "${state.player.firstName}",
	LastName:  "${state.player.lastName}",
})`;
        const rust = `// Step 2: Verify BVN Ownership
let res = client
    .post("https://api.ninja.ng/api/identity/identify")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`;
        showCodeFirstSlideOut({
            title: 'POST /api/identity/identify',
            endpoint: '/api/identity/identify',
            method: 'POST',
            description: 'Ninja cross-checks the bank BVN with NIBSS to verify account ownership belongs to the registered player.',
            curl,
            ts,
            python,
            go,
            rust,
            confirmLabel: 'Noted, Proceed →',
            onProceed: async () => {
                await executeStep2({ bankName, accNum, bvnNum, holderName, payload });
            },
        });
    });
}
async function executeStep2(p) {
    const result = document.getElementById('step2-result');
    if (!result)
        return;
    // Ninja checks that the BVN belongs to the player verified in Step 1.
    const { status, body } = await identify('Step 2 · Bank Match', p.payload);
    if (isOkStatus(status) && body.verified === true) {
        state.bankAccount = {
            bankName: p.bankName,
            accountNumber: p.accNum,
            bvn: p.bvnNum,
            isVerified: true,
        };
        saveState(state);
        result.hidden = false;
        result.innerHTML = `
      <div class="success" style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 0;">
        <div>
          <strong>✓ BVN Verified by Ninja (score ${formatScore(body.score)}, ${escapeHtml(String(body.recommendation || 'accept'))})</strong><br/>
          BVN ${escapeHtml(p.bvnNum)} belongs to registered player <strong>${escapeHtml(state.player.firstName)} ${escapeHtml(state.player.lastName)}</strong>. Bank account saved.
        </div>
        <button type="button" id="btn-next-step3" style="background: #10b981; color: #021a0e; font-weight: 800; padding: 12px; margin-top: 4px;">
          Continue to Step 3: Withdraw Funds →
        </button>
      </div>
    `;
        document.getElementById('btn-next-step3')?.addEventListener('click', () => {
            goToStep(3);
            syncFields();
        });
    }
    else {
        result.hidden = false;
        result.innerHTML = identifyFailureHtml('✗ Payout Account Blocked', 'BVN', p.bvnNum, status, body);
    }
}
// Calls the real Ninja identify endpoint through our backend and logs the
// real status, timing, request and response.
async function identify(step, payload) {
    const t0 = performance.now();
    try {
        const res = await fetch('/api/identity/identify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await readApiBody(res);
        addLog(step, 'POST', '/api/identity/identify', res.status, Math.round(performance.now() - t0), payload, body);
        return { status: res.status, body };
    }
    catch (err) {
        const body = { error: 'network_error', message: String(err?.message || err) };
        addLog(step, 'POST', '/api/identity/identify', 0, Math.round(performance.now() - t0), payload, body);
        return { status: 0, body };
    }
}
function formatScore(score) {
    return typeof score === 'number' ? score.toFixed(2) : '—';
}
// Plain-language explanation of a failed identify call, from Ninja's response.
function identifyFailureHtml(title, idLabel, idNumber, status, body) {
    const reasons = [];
    if (!isOkStatus(status)) {
        reasons.push(body?.message || body?.error || `The request failed (HTTP ${status}).`);
    }
    else if (body.found === false) {
        reasons.push(`No government record was found for ${idLabel} ${idNumber}.`);
    }
    else {
        for (const f of body.fields || []) {
            if (f.match !== 'exact') {
                const label = String(f.field).replace(/_/g, ' ');
                reasons.push(`${label} "${f.provided ?? ''}" ${f.detail || `is a ${f.match}`} (score ${formatScore(f.score)}).`);
            }
        }
        if (reasons.length === 0)
            reasons.push(`Ninja's recommendation: ${body.recommendation || 'reject'}.`);
    }
    return `
    <div class="error" style="padding: 14px; border-radius: 0;">
      <strong>${escapeHtml(title)}</strong>${body?.recommendation ? ` <span style="opacity:.8">· Ninja: ${escapeHtml(String(body.recommendation))}, score ${formatScore(body.score)}</span>` : ''}
      <ul style="margin: 8px 0 0; padding-left: 18px;">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </div>
  `;
}
// -----------------------------------------------------------------------------
// Step 3: Withdraw Funds (Biometric Verification Link)
// -----------------------------------------------------------------------------
function bindStep3() {
    const scenCards = document.querySelectorAll('.scenario-card-btn');
    const createFlowBtn = document.getElementById('btn-create-flow');
    const genBtn = document.getElementById('btn-generate-flow-link');
    const linkBox = document.getElementById('step3-link-box');
    const openLink = document.getElementById('link-open-camera');
    const urlText = document.getElementById('text-flow-url');
    const checkStatusBtn = document.getElementById('btn-check-verification');
    const releaseBtn = document.getElementById('btn-release-payout');
    const receipt = document.getElementById('step3-receipt');
    resetFlowStages();
    // Scenario toggle
    scenCards.forEach((card) => {
        card.addEventListener('click', () => {
            scenCards.forEach((c) => c.classList.remove('active'));
            card.classList.add('active');
            selectedScenario = card.dataset.scenario || 'prefilled';
            state.withdrawal.scenario = selectedScenario;
            saveState(state);
            resetFlowStages();
            updateDevCode();
        });
    });
    // Stage 1: Create a real Flow against the Ninja sandbox — reuse one if this
    // scenario already has one instead of creating a duplicate.
    createFlowBtn?.addEventListener('click', () => {
        const existing = state.createdFlows[selectedScenario];
        if (existing) {
            alert(`A flow for this scenario already exists (ID: ${existing.id}). Reusing it — not creating a duplicate.`);
            markFlowCreated(existing.id, genBtn, createFlowBtn);
            return;
        }
        const config = getFlowCreationConfig(selectedScenario);
        showCodeFirstSlideOut({
            title: 'POST /api/flows',
            endpoint: '/api/flows',
            method: 'POST',
            description: 'Registers a real verification Flow on your Ninja sandbox account — biometric rules, liveness thresholds, and the webhook.site URL that will receive the verification.completed event.',
            curl: config.curl,
            ts: config.ts,
            python: config.python,
            go: config.go,
            rust: config.rust,
            confirmLabel: 'Noted, Create Flow →',
            onProceed: async () => {
                const t0 = performance.now();
                const res = await fetch('/api/flows', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config.requestPayload),
                });
                const durationMs = Math.round(performance.now() - t0);
                const body = await readApiBody(res);
                addLog('Step 3 · Flow Setup', 'POST', '/api/flows', res.status, durationMs, config.requestPayload, body);
                if (!isOkStatus(res.status) || !body?.id) {
                    alert(`Flow creation failed (${res.status}): ${body?.message || body?.error || 'See the API log below for the full response.'}`);
                    throw new Error('flow creation failed');
                }
                state.createdFlows[selectedScenario] = { id: body.id, name: config.requestPayload.name };
                saveState(state);
                markFlowCreated(body.id, genBtn, createFlowBtn);
            },
        });
    });
    // Stage 2: Mint a real hosted verification link on the created Flow
    genBtn?.addEventListener('click', () => {
        if (!createdFlow)
            return;
        const flowId = createdFlow.id;
        const config = getLinkScenarioConfig(selectedScenario, `${state.player.firstName} ${state.player.lastName}`, state.player.id, 'wtd_01', state.player.firstName, state.player.lastName, state.player.dateOfBirth || '1975-01-01', flowId);
        showCodeFirstSlideOut({
            title: `POST /api/flows/${flowId}/links`,
            endpoint: `/api/flows/${flowId}/links`,
            method: 'POST',
            description: 'Creates a single-use hosted verification link on the real Flow for live biometric face validation before releasing payout funds.',
            curl: config.curl,
            ts: config.ts,
            python: config.python,
            go: config.go,
            rust: config.rust,
            confirmLabel: 'Noted, Mint Link →',
            onProceed: async () => {
                const t0 = performance.now();
                const res = await fetch(`/api/flows/${encodeURIComponent(flowId)}/links`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config.requestPayload),
                });
                const durationMs = Math.round(performance.now() - t0);
                const body = await readApiBody(res);
                addLog('Step 3 · Verification Link', 'POST', `/api/flows/${flowId}/links`, res.status, durationMs, config.requestPayload, body);
                if (!isOkStatus(res.status) || !body?.url) {
                    alert(`Link creation failed (${res.status}): ${body?.message || body?.error || 'See the API log below for the full response.'}`);
                    throw new Error('link creation failed');
                }
                activeVerification = { id: body.id, url: body.url };
                state.withdrawal.verificationUrl = body.url;
                state.withdrawal.faceStatus = 'pending';
                saveState(state);
                const stage2Card = document.getElementById('flow-stage-2-card');
                const stage2Pill = document.getElementById('flow-stage-2-pill');
                stage2Card?.classList.remove('active');
                stage2Card?.classList.add('completed');
                if (stage2Pill) {
                    stage2Pill.textContent = `✓ Link Minted: ${body.id}`;
                    stage2Pill.className = 'flow-status-pill pill-created';
                }
                if (genBtn)
                    genBtn.innerHTML = `<span>✓ Link Generated — View Link Request</span>`;
                if (linkBox)
                    linkBox.hidden = false;
                if (urlText)
                    urlText.textContent = body.url;
                if (openLink) {
                    openLink.onclick = (e) => {
                        e.preventDefault();
                        window.open(body.url, '_blank');
                    };
                }
                startVerificationPolling(activeVerification.id);
            },
        });
    });
    // Manual refresh — in case the tester would rather not wait for the poll
    checkStatusBtn?.addEventListener('click', async () => {
        if (!activeVerification)
            return;
        await pollVerificationOnce(activeVerification.id);
    });
    // Release Money
    releaseBtn?.addEventListener('click', () => {
        const amt = state.withdrawal.amountNaira;
        state.player.walletBalanceNaira = Math.max(0, state.player.walletBalanceNaira - amt);
        saveState(state);
        window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
        try {
            confetti({ particleCount: 90, spread: 60, origin: { y: 0.7 } });
        }
        catch { }
        const payoutRequest = {
            amount: amt,
            currency: 'NGN',
            beneficiary: `${state.player.firstName} ${state.player.lastName}`,
            bank: state.bankAccount?.bankName || 'Access Bank',
            account_number: state.bankAccount?.accountNumber || '0123456789',
            verification_flow: createdFlow?.id ?? null,
            verification_id: tracker?.id ?? activeVerification?.id ?? null,
            face_score: tracker?.result?.face_score ?? null,
            liveness_score: tracker?.result?.liveness_score ?? null,
        };
        const payoutResponse = {
            status: 'SETTLED',
            transaction_reference: 'NINJA_PAY_' + Date.now(),
            amount_settled: amt,
            beneficiary: `${state.player.firstName} ${state.player.lastName}`,
            cleared_at: new Date().toISOString(),
        };
        addLog('Payout · Disburse', 'POST', '/api/payouts/send', 200, 115, payoutRequest, payoutResponse);
        if (receipt) {
            receipt.hidden = false;
            receipt.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 0; padding: 16px; margin-top: 14px;">
          <h4 style="margin: 0 0 6px; color: #34d399; font-size: 15px;">🎉 Money Disbursed Successfully!</h4>
          <p style="margin: 0 0 12px; font-size: 13px; color: #cbd5e1;">
            <strong>${formatNaira(amt)}</strong> has been securely transferred to verified account holder <strong>${state.player.firstName} ${state.player.lastName}</strong> (${state.bankAccount?.bankName || 'Access Bank'} - ${state.bankAccount?.accountNumber || '0123456789'}).
          </p>
          <button type="button" id="btn-restart-demo" class="btn-reset-ghost" style="padding: 8px 14px; font-size: 12px;">
            ↺ Reset Demo to Step 1
          </button>
        </div>
      `;
            document.getElementById('btn-restart-demo')?.addEventListener('click', () => {
                goToStep(1);
                syncFields();
            });
        }
    });
}
// -----------------------------------------------------------------------------
// Real Verification Tracking — two sources, whichever answers first:
//   1. GET /api/verifications/:id — the session's status straight from Ninja.
//   2. GET /api/webhook-events?verification_id=… — the verification.completed
//      webhook Ninja delivered to NINJA_WEBHOOK_URL (webhook.site), read back
//      by the backend. A browser page can't receive a webhook itself.
// Once resolved we show pass/fail with the reasons, and keep checking for the
// webhook for a short while so its payload can be shown too.
// -----------------------------------------------------------------------------
let createdFlow = null;
let activeVerification = null;
let pollTimer = null;
// Marks Stage 1 as done and unlocks Stage 2, whether the flow was just
// created or we're reusing one that already exists for this scenario.
function markFlowCreated(flowId, genBtn, createFlowBtn) {
    createdFlow = { id: flowId, scenario: selectedScenario };
    const stage1Card = document.getElementById('flow-stage-1-card');
    const stage1Pill = document.getElementById('flow-stage-1-pill');
    const flowTargetLabel = document.getElementById('flow-target-name-label');
    const stage2Card = document.getElementById('flow-stage-2-card');
    const stage2Pill = document.getElementById('flow-stage-2-pill');
    stage1Card?.classList.remove('active');
    stage1Card?.classList.add('completed');
    if (stage1Pill) {
        stage1Pill.textContent = `✓ Created: ${flowId}`;
        stage1Pill.className = 'flow-status-pill pill-created';
    }
    if (flowTargetLabel)
        flowTargetLabel.textContent = `POST /api/flows · Real Flow ID: ${flowId}`;
    if (createFlowBtn)
        createFlowBtn.innerHTML = `<span>✓ Flow Created (${flowId})</span>`;
    stage2Card?.classList.remove('locked');
    stage2Card?.classList.add('active');
    if (stage2Pill) {
        stage2Pill.textContent = 'Ready to Mint Link';
        stage2Pill.className = 'flow-status-pill pill-ready';
    }
    if (genBtn)
        genBtn.disabled = false;
}
// Stage 1 + 2 explanations, written from the selected scenario's real payloads
// so they always match what will be sent.
function updateStageExplanations() {
    const flow = getFlowCreationConfig(selectedScenario).requestPayload;
    const link = getLinkScenarioConfig(selectedScenario, `${state.player.firstName} ${state.player.lastName}`.trim() || 'James Bond', state.player.id, 'wtd_01', state.player.firstName || 'James', state.player.lastName || 'Bond', state.player.dateOfBirth || '1975-01-01').requestPayload;
    const fields = flow.rules?.fields || [];
    const fromBusiness = fields.length > 0 && fields.every((f) => f.source === 'business');
    const names = fields.map((f) => f.field.replace(/_/g, ' ')).join(', ');
    const thresholds = `Face match must reach <strong>${flow.selfie_threshold}%</strong> and liveness <strong>${flow.liveness_threshold}%</strong>.`;
    const stage1 = document.getElementById('flow-stage-1-explanation');
    if (stage1) {
        stage1.innerHTML = fromBusiness
            ? `In Ninja, a <strong>Flow</strong> is a reusable configuration that defines your verification rules. This flow sets <code>source: "business"</code> on ${escapeHtml(names)}, so <strong>our backend supplies them</strong> when it creates each link. The player skips the form and goes straight to the live face check. ${thresholds}`
            : `In Ninja, a <strong>Flow</strong> is a reusable configuration that defines your verification rules. This flow sets <code>source: "customer"</code> on ${escapeHtml(names)}, so <strong>the player types them</strong> on Ninja's hosted page before the face check. Ninja then matches what they typed against the ID record. ${thresholds}`;
    }
    const stage2Title = document.getElementById('flow-stage-2-title');
    if (stage2Title)
        stage2Title.textContent = link.values ? '💡 Link Generation & Pre-population' : '💡 Link Generation (Player Fills the Form)';
    const stage2 = document.getElementById('flow-stage-2-explanation');
    if (stage2) {
        const v = link.values;
        const ref = `<code>customer_ref: "${escapeHtml(String(link.customer_ref))}"</code>`;
        stage2.innerHTML = v
            ? `Once the flow exists, mint a single-use verification link. We send the player's details in <code>values</code> (${escapeHtml(`${v.first_name} ${v.last_name}, ${v.date_of_birth}`)}) and ${ref}, which ties this session to the withdrawal${selectedScenario === 'custom' ? ' and comes back in the webhook, so the result can be matched to your payout queue automatically' : ''}.`
            : `Once the flow exists, mint a single-use verification link. We send <strong>no <code>values</code></strong>, only the player's name and ${ref}. The player fills in their details on Ninja's page, and the reference ties the session to this withdrawal.`;
    }
}
function resetFlowStages() {
    updateStageExplanations();
    stopVerificationPolling();
    tracker = null;
    createdFlow = null;
    activeVerification = null;
    const stage1Card = document.getElementById('flow-stage-1-card');
    const stage1Pill = document.getElementById('flow-stage-1-pill');
    const flowTargetLabel = document.getElementById('flow-target-name-label');
    const createFlowBtn = document.getElementById('btn-create-flow');
    const stage2Card = document.getElementById('flow-stage-2-card');
    const stage2Pill = document.getElementById('flow-stage-2-pill');
    const genBtn = document.getElementById('btn-generate-flow-link');
    const linkBox = document.getElementById('step3-link-box');
    const releaseBox = document.getElementById('step3-release-box');
    const receipt = document.getElementById('step3-receipt');
    stage1Card?.classList.remove('completed');
    stage1Card?.classList.add('active');
    if (stage1Pill) {
        stage1Pill.textContent = 'Ready to Create';
        stage1Pill.className = 'flow-status-pill pill-ready';
    }
    if (flowTargetLabel)
        flowTargetLabel.textContent = `POST /api/flows · Name: "${getFlowCreationConfig(selectedScenario).requestPayload.name}"`;
    if (createFlowBtn)
        createFlowBtn.innerHTML = `<span>⚡ 1. Programmatically Create Flow (POST /api/flows) →</span>`;
    stage2Card?.classList.remove('active', 'completed');
    stage2Card?.classList.add('locked');
    if (stage2Pill) {
        stage2Pill.textContent = 'Requires Flow Creation';
        stage2Pill.className = 'flow-status-pill pill-pending';
    }
    if (genBtn) {
        genBtn.disabled = true;
        genBtn.innerHTML = `<span>🔗 2. Generate Verification Link (POST /api/flows/:id/links) →</span>`;
    }
    if (linkBox)
        linkBox.hidden = true;
    if (releaseBox)
        releaseBox.hidden = true;
    const returnNote = document.getElementById('step3-return-note');
    if (returnNote)
        returnNote.hidden = true;
    if (receipt)
        receipt.hidden = true;
    setPollStatusUI('idle');
    // A flow already exists for this scenario — reflect that instead of
    // leaving Stage 1 looking like nothing has happened yet.
    const existing = state.createdFlows[selectedScenario];
    if (existing) {
        markFlowCreated(existing.id, genBtn, createFlowBtn);
    }
}
function setPollStatusUI(mode) {
    const box = document.getElementById('step3-verify-status');
    if (!box)
        return;
    box.dataset.mode = mode;
    box.hidden = mode === 'idle';
    const text = box.querySelector('.verify-status-text');
    const checkBtn = box.querySelector('#btn-check-verification');
    if (mode === 'waiting') {
        if (text)
            text.textContent = 'Waiting for you to complete the real biometric check at the link above — checking every few seconds…';
        if (checkBtn)
            checkBtn.hidden = false;
    }
    else if (mode === 'done') {
        if (text)
            text.textContent = '✓ Verification session finished — result below.';
        if (checkBtn)
            checkBtn.hidden = true;
    }
    if (mode === 'idle')
        renderVerificationResult(null);
}
// After the result is known, keep looking for the webhook this long before
// saying it didn't arrive (webhook.site usually has it within a few seconds).
const WEBHOOK_GRACE_MS = 60_000;
let tracker = null;
function startVerificationPolling(verificationId) {
    stopVerificationPolling();
    tracker = { id: verificationId, result: null, webhook: null, inboxUrl: null, webhookSource: null, resolvedAt: null };
    setPollStatusUI('waiting');
    renderVerificationResult(tracker);
    pollTimer = setInterval(() => pollVerificationOnce(verificationId), 4000);
}
function stopVerificationPolling() {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}
async function pollVerificationOnce(verificationId) {
    const t = tracker;
    if (!t || t.id !== verificationId)
        return;
    if (!t.result)
        await checkVerificationStatus(t);
    if (!t.webhook && t.webhookSource !== 'unsupported')
        await checkWebhookEvents(t);
    if (t !== tracker)
        return;
    if (t.result) {
        const webhookDone = !!t.webhook || t.webhookSource === 'unsupported';
        const gaveUp = t.resolvedAt !== null && Date.now() - t.resolvedAt > WEBHOOK_GRACE_MS;
        if (webhookDone || gaveUp)
            stopVerificationPolling();
    }
    renderVerificationResult(t);
}
async function checkVerificationStatus(t) {
    try {
        const path = `/api/verifications/${encodeURIComponent(t.id)}`;
        const t0 = performance.now();
        const res = await fetch(path);
        const body = await readApiBody(res);
        if (!isOkStatus(res.status))
            return;
        if (body.status && body.status !== 'pending' && body.status !== 'opened') {
            addLog('Step 3 · Verification Status', 'GET', path, res.status, Math.round(performance.now() - t0), {}, body);
            resolveVerification(t, body);
        }
    }
    catch {
        // Network hiccup — the interval will retry.
    }
}
async function checkWebhookEvents(t) {
    try {
        const path = `/api/webhook-events?verification_id=${encodeURIComponent(t.id)}`;
        const t0 = performance.now();
        const res = await fetch(path);
        const body = await readApiBody(res);
        if (!isOkStatus(res.status))
            return;
        t.inboxUrl = body.inbox_url ?? null;
        t.webhookSource = body.source ?? null;
        const event = (body.events || []).find((e) => e.payload?.data);
        if (!event)
            return;
        t.webhook = event;
        const passed = event.payload.data?.outcome === 'verified';
        addLog(passed ? 'Webhook · Face Verified' : 'Webhook · Face Failed', 'GET', path, res.status, Math.round(performance.now() - t0), {}, event);
        // The webhook can arrive before the status poll sees the change.
        if (!t.result && event.payload.data)
            resolveVerification(t, event.payload.data);
    }
    catch {
        // Network hiccup — the interval will retry.
    }
}
function resolveVerification(t, data) {
    t.result = data;
    t.resolvedAt = Date.now();
    setPollStatusUI('done');
    const passed = data.outcome === 'verified';
    state.withdrawal.faceStatus = passed ? 'passed' : 'failed';
    saveState(state);
    const releaseBox = document.getElementById('step3-release-box');
    if (releaseBox)
        releaseBox.hidden = !passed;
    const releaseMsg = document.getElementById('step3-release-msg');
    if (releaseMsg && passed) {
        const face = typeof data.face_score === 'number' ? ` Face matched with ${data.face_score}% confidence.` : '';
        releaseMsg.textContent = `✓ Identity confirmed against the government record.${face} You can now safely disburse funds.`;
    }
}
// Turns a failed verification into plain-language reasons.
function failureReasons(v) {
    const reasons = [];
    const flow = getFlowCreationConfig(selectedScenario).requestPayload;
    const faceMin = Number(flow.selfie_threshold) || 0;
    const livenessMin = Number(flow.liveness_threshold) || 0;
    if (v.status && !['completed', 'failed'].includes(v.status)) {
        reasons.push(`The session ended as "${v.status}" before a decision was made.`);
    }
    if (v.outcome === 'not_found') {
        const id = typeof v.id_number === 'string' ? ` ${String(v.id_type || 'ID').toUpperCase()} ${v.id_number}` : ' this ID number';
        reasons.push(`No government record was found for${id}. Check the number and try again.`);
    }
    else if (v.outcome && v.outcome !== 'verified') {
        reasons.push(`Ninja's decision: ${v.outcome.replace(/_/g, ' ')}.`);
    }
    for (const key of ['reason', 'failure_reason', 'decline_reason', 'error', 'message']) {
        const val = v[key];
        if (typeof val === 'string' && val)
            reasons.push(val);
    }
    if (typeof v.face_score === 'number' && faceMin && v.face_score < faceMin) {
        reasons.push(`Face match ${v.face_score}% is below the ${faceMin}% required by this flow.`);
    }
    if (typeof v.liveness_score === 'number' && livenessMin && v.liveness_score < livenessMin) {
        reasons.push(`Liveness ${v.liveness_score}% is below the ${livenessMin}% required by this flow.`);
    }
    for (const f of v.fields || []) {
        if (!fieldMatched(f)) {
            const label = f.field.replace(/_/g, ' ');
            const provided = f.provided ? ` ("${f.provided}")` : '';
            reasons.push(`${label}${provided} didn't fully match the ID record (${f.match || 'no match'}, score ${f.score ?? 0}).`);
        }
    }
    if (reasons.length === 0)
        reasons.push('Ninja did not return a specific reason. See the full payload below.');
    return reasons;
}
function fieldMatched(f) {
    return f.match === 'exact' || (typeof f.score === 'number' && f.score >= 1);
}
function renderVerificationResult(t) {
    const box = document.getElementById('step3-result');
    if (!box)
        return;
    if (!t) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    box.hidden = false;
    const v = t.result;
    const outcome = !v ? 'pending' : v.outcome === 'verified' ? 'passed' : 'failed';
    box.dataset.outcome = outcome;
    const pct = (n) => (typeof n === 'number' ? `${n}%` : '—');
    const score = (n) => (typeof n === 'number' ? n.toFixed(2) : '—');
    const headline = outcome === 'pending'
        ? `<span class="verify-result-badge">● Waiting</span><span class="verify-result-title">No result yet</span>`
        : outcome === 'passed'
            ? `<span class="verify-result-badge">✓ Passed</span><span class="verify-result-title">Identity verified — payout can be released</span>`
            : `<span class="verify-result-badge">✕ Failed</span><span class="verify-result-title">Verification failed — payout blocked</span>`;
    const metrics = v
        ? `<div class="verify-result-metrics">
        <div><span>Status</span><strong>${escapeHtml(String(v.status || '—'))}</strong></div>
        <div><span>Outcome</span><strong>${escapeHtml(String(v.outcome || '—'))}</strong></div>
        <div><span>Match score</span><strong>${score(v.score)}</strong></div>
        <div><span>Face</span><strong>${pct(v.face_score)}</strong></div>
        <div><span>Liveness</span><strong>${pct(v.liveness_score)}</strong></div>
      </div>`
        : '';
    const fields = v && v.fields?.length
        ? `<table class="verify-result-fields">
          <thead><tr><th>Field</th><th>Provided</th><th>Match</th><th>Score</th></tr></thead>
          <tbody>${v.fields
            .map((f) => {
            const ok = fieldMatched(f);
            return `<tr class="${ok ? 'ok' : 'bad'}">
                <td>${ok ? '✓' : '✕'} ${escapeHtml(f.field.replace(/_/g, ' '))}</td>
                <td>${escapeHtml(f.provided ?? '—')}</td>
                <td>${escapeHtml(f.match ?? '—')}</td>
                <td>${score(f.score)}</td>
              </tr>`;
        })
            .join('')}</tbody>
        </table>`
        : '';
    const errors = outcome === 'failed' && v
        ? `<div class="error verify-result-errors"><strong>Why it failed</strong><ul>${failureReasons(v)
            .map((r) => `<li>${escapeHtml(r)}</li>`)
            .join('')}</ul></div>`
        : '';
    const inbox = t.inboxUrl ? ` <a href="${escapeHtml(t.inboxUrl)}" target="_blank" rel="noopener">Open inbox ↗</a>` : '';
    let webhook;
    if (t.webhook) {
        const w = t.webhook;
        webhook = `<div class="verify-webhook-meta">
        <span><b>Event</b> ${escapeHtml(w.event || '—')}</span>
        <span><b>Delivery</b> ${escapeHtml(w.delivery_id || '—')}</span>
        <span><b>Received</b> ${escapeHtml(w.received_at || '—')}</span>
        <span title="${escapeHtml(w.signature || '')}"><b>Signature</b> ${escapeHtml(w.signature ? w.signature.slice(0, 28) + '…' : '—')}</span>
      </div>
      <pre class="verify-webhook-payload">${escapeHtml(JSON.stringify(w.payload, null, 2))}</pre>`;
    }
    else if (t.webhookSource === 'unsupported') {
        webhook = `<p class="verify-webhook-note">NINJA_WEBHOOK_URL isn't a webhook.site inbox, so the backend can't read deliveries back. Check your webhook endpoint directly.</p>`;
    }
    else if (v && t.resolvedAt !== null && Date.now() - t.resolvedAt > WEBHOOK_GRACE_MS) {
        webhook = `<p class="verify-webhook-note">No webhook for this verification showed up in the inbox.${inbox} Flows created before the backend started setting <code>webhook_url</code> from <code>.env</code> still deliver to their old URL. Reset the demo to create a fresh flow.</p>`;
    }
    else {
        webhook = `<p class="verify-webhook-note"><span class="verify-status-dot"></span> Waiting for the <code>verification.completed</code> webhook…${inbox}</p>`;
    }
    box.innerHTML = `
    <div class="verify-result-head">${headline}</div>
    ${errors}
    ${metrics}
    ${fields}
    <div class="verify-webhook">
      <div class="verify-webhook-title">Webhook from Ninja</div>
      ${webhook}
    </div>
  `;
}
// -----------------------------------------------------------------------------
// Live Code Inspector & Telemetry
// -----------------------------------------------------------------------------
function bindDevTools() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            if (target.id === 'subtab-mint-link' || target.id === 'subtab-create-flow') {
                return;
            }
            document.querySelectorAll('.tab-btn').forEach((b) => {
                if (b.id !== 'subtab-mint-link' && b.id !== 'subtab-create-flow') {
                    b.classList.remove('active');
                }
            });
            target.classList.add('active');
            activeTab = target.dataset.tab || 'curl';
            updateDevCode();
        });
    });
    // Subtabs for Step 3
    document.getElementById('subtab-mint-link')?.addEventListener('click', () => {
        step3Subtab = 'mint';
        document.getElementById('subtab-mint-link')?.classList.add('active');
        document.getElementById('subtab-create-flow')?.classList.remove('active');
        updateDevCode();
    });
    document.getElementById('subtab-create-flow')?.addEventListener('click', () => {
        step3Subtab = 'flow';
        document.getElementById('subtab-create-flow')?.classList.add('active');
        document.getElementById('subtab-mint-link')?.classList.remove('active');
        updateDevCode();
    });
    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
        state.logs = [];
        saveState(state);
        renderLogs();
    });
}
function bindCopyCode() {
    const copyBtn = document.getElementById('btn-copy-code');
    const statusText = document.getElementById('copy-status-text');
    const codeBlock = document.getElementById('dev-code-block');
    copyBtn?.addEventListener('click', () => {
        if (!codeBlock)
            return;
        const text = codeBlock.textContent || '';
        navigator.clipboard
            .writeText(text)
            .then(() => {
            if (statusText)
                statusText.textContent = '✓ Copied!';
            setTimeout(() => {
                if (statusText)
                    statusText.textContent = '📋 Copy';
            }, 1800);
        })
            .catch(() => {
            if (statusText)
                statusText.textContent = '✓ Copied!';
        });
    });
}
function updateDevCode() {
    const endpointEl = document.getElementById('dev-endpoint-label');
    const codeEl = document.getElementById('dev-code-block');
    if (!codeEl)
        return;
    let endpoint = 'POST /api/identity/identify';
    let snippet = '';
    let lang = 'bash';
    if (state.currentStep === 1) {
        endpoint = 'POST /api/identity/identify';
        const fn = state.player.firstName;
        const ln = state.player.lastName;
        const nin = state.player.nin;
        const dob = state.player.dateOfBirth;
        if (activeTab === 'curl') {
            lang = 'bash';
            snippet = `curl -X POST https://api.ninja.ng/api/identity/identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "idType": "nin",
    "mode": "verify",
    "idNumber": "${nin}",
    "firstName": "${fn}",
    "lastName": "${ln}",
    "dateOfBirth": "${dob}"
  }'`;
        }
        else if (activeTab === 'ts') {
            lang = 'javascript';
            snippet = `// Step 1: NIN Verification & Legal Age Check
const result = await ninja.identity.identify({
  idType: 'nin',
  mode: 'verify',
  idNumber: '${nin}',
  firstName: '${fn}',
  lastName: '${ln}',
  dateOfBirth: '${dob}',
})`;
        }
        else if (activeTab === 'python') {
            lang = 'python';
            snippet = `# Step 1: NIN Verification & Legal Age Check
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "idType": "nin",
        "mode": "verify",
        "idNumber": "${nin}",
        "firstName": "${fn}",
        "lastName": "${ln}",
        "dateOfBirth": "${dob}"
    }
)`;
        }
        else {
            lang = 'go';
            snippet = `// Step 1: NIN Verification & Legal Age Check
resp, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	IDType:      "nin",
	Mode:        "verify",
	IDNumber:    "${nin}",
	FirstName:   "${fn}",
	LastName:    "${ln}",
	DateOfBirth: "${dob}",
})`;
        }
    }
    else if (state.currentStep === 2) {
        endpoint = 'POST /api/identity/identify';
        const fn = state.player.firstName;
        const ln = state.player.lastName;
        const bvn = state.bankAccount?.bvn || '77777777777';
        if (activeTab === 'curl') {
            lang = 'bash';
            snippet = `curl -X POST https://api.ninja.ng/api/identity/identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "idType": "bvn",
    "mode": "verify",
    "idNumber": "${bvn}",
    "firstName": "${fn}",
    "lastName": "${ln}"
  }'`;
        }
        else if (activeTab === 'ts') {
            lang = 'javascript';
            snippet = `// Step 2: Validate BVN Ownership Against Registered User
const result = await ninja.identity.identify({
  idType: 'bvn',
  mode: 'verify',
  idNumber: '${bvn}',
  firstName: '${fn}',
  lastName: '${ln}',
})`;
        }
        else if (activeTab === 'python') {
            lang = 'python';
            snippet = `# Step 2: Validate BVN Ownership
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "idType": "bvn",
        "mode": "verify",
        "idNumber": "${bvn}",
        "firstName": "${fn}",
        "lastName": "${ln}"
    }
)`;
        }
        else {
            lang = 'go';
            snippet = `// Step 2: Validate BVN Ownership
resp, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	IDType:    "bvn",
	Mode:      "verify",
	IDNumber:  "${bvn}",
	FirstName: "${fn}",
	LastName:  "${ln}",
})`;
        }
    }
    else {
        // Step 3
        if (step3Subtab === 'flow') {
            const flowCfg = getFlowCreationConfig();
            endpoint = 'POST /api/flows';
            if (activeTab === 'curl') {
                lang = 'bash';
                snippet = flowCfg.curl;
            }
            else if (activeTab === 'ts') {
                lang = 'javascript';
                snippet = flowCfg.ts;
            }
            else if (activeTab === 'python') {
                lang = 'python';
                snippet = flowCfg.python;
            }
            else {
                lang = 'go';
                snippet = flowCfg.go;
            }
        }
        else {
            const cfg = getLinkScenarioConfig(selectedScenario, `${state.player.firstName} ${state.player.lastName}`, state.player.id, 'wtd_01', state.player.firstName, state.player.lastName, state.player.dateOfBirth || '1975-01-01', state.createdFlows[selectedScenario]?.id);
            endpoint = `POST /api/flows/${cfg.flowId}/links`;
            if (activeTab === 'curl') {
                lang = 'bash';
                snippet = cfg.curl;
            }
            else if (activeTab === 'ts') {
                lang = 'javascript';
                snippet = cfg.ts;
            }
            else if (activeTab === 'python') {
                lang = 'python';
                snippet = cfg.python;
            }
            else {
                lang = 'go';
                snippet = cfg.go;
            }
        }
    }
    if (endpointEl)
        endpointEl.textContent = endpoint;
    codeEl.className = `language-${lang}`;
    codeEl.innerHTML = Prism.highlight(snippet, Prism.languages[lang] || Prism.languages.javascript, lang);
}
function isOkStatus(status) {
    return status >= 200 && status < 300;
}
// Parses an /api/* response. Every backend in backends/ answers with JSON, so a
// non-JSON 404 means a static server (npm run serve) answered instead, and a
// 502/504 means `ham proxy` is up but nothing is listening on :8080.
async function readApiBody(res) {
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const body = isJson ? await res.json().catch(() => ({})) : {};
    if (isJson)
        return body;
    if (res.status === 404 || res.status === 502 || res.status === 504) {
        return {
            error: 'backend_not_running',
            message: 'No API backend answered /api/*. Run `npm run dev` (starts a backend and `ham proxy`), ' +
                'then open http://localhost:8082. `npm run serve` on :5671 serves static files only.',
        };
    }
    return body;
}
function addLog(step, method, endpoint, status, durationMs, requestPayload, responsePayload) {
    const log = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        step,
        method,
        endpoint,
        status,
        durationMs,
        requestPayload,
        responsePayload,
        summary: `${step} · ${status} · ${endpoint}`,
    };
    state.logs.unshift(log);
    if (state.logs.length > 25)
        state.logs.pop();
    saveState(state);
    renderLogs(log.id);
}
const logActiveLang = {};
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
    const list = document.getElementById('dev-call-log-list');
    if (!list)
        return;
    if (state.logs.length === 0) {
        list.innerHTML = `
      <div style="font-size: 11.5px; color: var(--muted); text-align: center; padding: 24px;" id="empty-logs-label">
        No API calls made yet. Click any button on the left to trigger a live call.
      </div>
    `;
        return;
    }
    function getTagClass(step) {
        const s = String(step || '');
        if (s.includes('Step 1'))
            return 'tag-step-1';
        if (s.includes('Step 2'))
            return 'tag-step-2';
        if (s.includes('Step 3'))
            return 'tag-step-3';
        if (s.includes('Webhook'))
            return 'tag-webhook';
        if (s.includes('Payout'))
            return 'tag-payout';
        return 'tag-step-1';
    }
    list.innerHTML = state.logs
        .map((l, index) => {
        const isOpen = openLogId ? l.id === openLogId : index === 0;
        const activeLang = logActiveLang[l.id] || 'curl';
        const snippets = generateCodeSnippets(l.method, l.endpoint, l.requestPayload);
        const currentSnippet = snippets[activeLang] || snippets.curl;
        const highlightedCode = Prism.highlight(currentSnippet.code, Prism.languages[currentSnippet.lang] || Prism.languages.javascript, currentSnippet.lang);
        return `
        <div class="api-log-entry ${isOpen ? 'open' : ''}" data-log-id="${l.id}">
          <div class="api-log-header">
            <div class="api-log-header-left">
              <span class="api-log-step-tag ${getTagClass(l.step)}">${escapeHtml(l.step)}</span>
              <span class="api-log-method">${l.method}</span>
              <code class="api-log-path" title="${escapeHtml(l.endpoint)}">${escapeHtml(l.endpoint)}</code>
            </div>
            <div class="api-log-meta">
              <span class="api-log-time">${l.durationMs}ms</span>
              <span class="api-log-status ${isOkStatus(l.status) ? 'api-log-status-ok' : 'api-log-status-error'}">${l.status}</span>
              <span class="api-log-chevron">▼</span>
            </div>
          </div>
          <div class="api-log-details" ${isOpen ? '' : 'hidden'}>
            <!-- Multi-language code snippet box with tabs & copy button -->
            <div class="api-log-code-box">
              <div class="api-log-toolbar">
                <div class="api-log-lang-tabs" data-log-id="${l.id}">
                  <button type="button" class="api-log-lang-tab ${activeLang === 'curl' ? 'active' : ''}" data-lang="curl">cURL</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'javascript' ? 'active' : ''}" data-lang="javascript">JavaScript</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'python' ? 'active' : ''}" data-lang="python">Python</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'go' ? 'active' : ''}" data-lang="go">Go</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'rust' ? 'active' : ''}" data-lang="rust">Rust</button>
                </div>
                <button type="button" class="btn-copy-log-snippet" data-log-id="${l.id}" title="Copy snippet">
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
                  <span class="label-method">${l.method} ${escapeHtml(l.endpoint)}</span>
                </div>
                <pre class="api-log-code"><code>${escapeHtml(JSON.stringify(l.requestPayload, null, 2))}</code></pre>
              </div>
              <div class="api-log-section">
                <div class="api-log-section-label">
                  <span>Server Response</span>
                  <span style="color: ${isOkStatus(l.status) ? '#34d399' : '#f87171'}; font-family: var(--font-mono); font-weight: 800;">${l.status} ${isOkStatus(l.status) ? 'OK' : 'REJECT'}</span>
                </div>
                <pre class="api-log-code"><code>${escapeHtml(JSON.stringify(l.responsePayload, null, 2))}</code></pre>
              </div>
            </div>
          </div>
        </div>
      `;
    })
        .join('');
    // Accordion click
    list.querySelectorAll('.api-log-header').forEach((hdr) => {
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
    list.querySelectorAll('.api-log-lang-tab').forEach((tabBtn) => {
        tabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const newLang = btn.dataset.lang || 'curl';
            const logId = btn.closest('.api-log-entry')?.getAttribute('data-log-id');
            if (logId) {
                logActiveLang[logId] = newLang;
                const entry = list.querySelector(`.api-log-entry[data-log-id="${logId}"]`);
                if (entry) {
                    const logItem = state.logs.find((item) => item.id === logId);
                    if (logItem) {
                        const snippets = generateCodeSnippets(logItem.method, logItem.endpoint, logItem.requestPayload);
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
    list.querySelectorAll('.btn-copy-log-snippet').forEach((copyBtn) => {
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
            const snippets = generateCodeSnippets(logItem.method, logItem.endpoint, logItem.requestPayload);
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
function calculateAge(dobStr) {
    try {
        const dob = new Date(dobStr);
        const diff = Date.now() - dob.getTime();
        return Math.abs(new Date(diff).getUTCFullYear() - 1970);
    }
    catch {
        return 25;
    }
}
function formatNaira(val) {
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        maximumFractionDigits: 0,
    }).format(val);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
}
else {
    init();
}
