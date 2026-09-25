import confetti from './node_modules/canvas-confetti/dist/confetti.module.js';
import Prism from './node_modules/prismjs/prism.js';
import './node_modules/prismjs/components/prism-go.js';
import './node_modules/prismjs/components/prism-bash.js';
import './node_modules/prismjs/components/prism-python.js';
import { api } from './lib/api.js';
import { loadState, saveState } from './lib/state.js';
import { showCodeFirstSlideOut } from './lib/codeModal.js';
import { getLinkScenarioConfig } from './lib/linkScenarios.js';

// =============================================================================
// ninja-bet V2 / V3: Simple, Human-Friendly Developer Demo (SPA / GitHub Pages)
// =============================================================================
let state = loadState();
let activeTab = 'curl';
let selectedScenario = 'prefilled';
function init() {
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
    goToStep(state.currentStep);
    syncFields();
    renderLogs();
    updateDevCode();
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
    if (v1)
        v1.hidden = step !== 1;
    if (v2)
        v2.hidden = step !== 2;
    if (v3)
        v3.hidden = step !== 3;
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
    // Step 2 label
    const c2Label = document.getElementById('c2-player-label');
    if (c2Label)
        c2Label.textContent = `${state.player.firstName} ${state.player.lastName}`;
    // Step 3 summary
    const c3Bank = document.getElementById('c3-bank-summary');
    const c3Amt = document.getElementById('c3-amount-summary');
    if (c3Bank) {
        if (state.bankAccount && state.bankAccount.isVerified) {
            c3Bank.textContent = `${state.bankAccount.bankName} · ${state.bankAccount.accountNumber} (${state.player.firstName} ${state.player.lastName})`;
        }
        else {
            c3Bank.textContent = 'Access Bank · 0123456789 (James Bond)';
        }
    }
    if (c3Amt) {
        c3Amt.textContent = formatNaira(state.player.walletBalanceNaira);
    }
}
// -----------------------------------------------------------------------------
// Simulation Parameters (Wallet Balance)
// -----------------------------------------------------------------------------
function bindSimulationWallet() {
    const btns = document.querySelectorAll('.param-preset-btn');
    const input = document.getElementById('sim-wallet-input');
    btns.forEach((btn) => {
        btn.addEventListener('click', () => {
            btns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const val = Number(btn.dataset.amount || '250000');
            if (input)
                input.value = String(val);
            state.player.walletBalanceNaira = val;
            state.player.withdrawableBalanceNaira = val;
            state.withdrawal.amountNaira = val;
            saveState(state);
            window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
            syncFields();
        });
    });
    input?.addEventListener('input', () => {
        const val = Number(input.value || '10000');
        state.player.walletBalanceNaira = val;
        state.player.withdrawableBalanceNaira = val;
        state.withdrawal.amountNaira = val;
        saveState(state);
        window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
        syncFields();
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
    // Example presets
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
        const firstName = fn?.value.trim() || 'James';
        const lastName = ln?.value.trim() || 'Bond';
        const phoneNum = phone?.value.trim() || '08012345678';
        const ninNum = nin?.value.trim() || '77777777777';
        const dobVal = dob?.value.trim() || '1975-01-01';
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
        const ts = `// Step 1: Verify NIN, Name, and Age in one call
const result = await ninja.identity.identify({
  idType: 'nin',
  mode: 'verify',
  idNumber: '${ninNum}',
  firstName: '${firstName}',
  lastName: '${lastName}',
  dateOfBirth: '${dobVal}',
})

if (result.verified && result.data.age >= 18) {
  console.log('Player verified!')
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
        showCodeFirstSlideOut({
            title: 'POST /api/identity/identify',
            endpoint: '/api/identity/identify',
            method: 'POST',
            description: 'Ninja verifies the player name, NIN, and age in one simple call.',
            curl,
            ts,
            python,
            go,
            confirmLabel: 'Noted, Proceed →',
            onProceed: async () => {
                await executeStep1({ firstName, lastName, phoneNum, ninNum, dobVal });
            },
        });
    });
}
async function executeStep1(p) {
    const result = document.getElementById('step1-result');
    if (!result)
        return;
    const age = calculateAge(p.dobVal);
    // Check age
    if (age < 18) {
        addLog('POST', '/api/identity/identify', 400, 45, {
            error: `Underage: Player is ${age} years old (must be 18+)`,
        });
        result.hidden = false;
        result.innerHTML = `
      <div class="error" style="padding: 14px; border-radius: 8px;">
        <strong>✗ Player Under 18</strong><br/>
        Birth date indicates age <strong>${age}</strong>. Players under 18 cannot create an account.
      </div>
    `;
        return;
    }
    // Attempt backend or simulation
    let isMatch = false;
    let score = 0.15;
    try {
        const res = await api.register({
            first_name: p.firstName,
            last_name: p.lastName,
            phone_number: p.phoneNum,
            nin: p.ninNum,
            password: 'password123',
        });
        isMatch = res.player.kyc_status === 'verified';
        score = res.verify_result?.score ?? (isMatch ? 1.0 : 0.2);
    }
    catch {
        // Sandbox fixture check
        if (p.ninNum === '77777777777' && p.firstName.toLowerCase() === 'james') {
            isMatch = true;
            score = 1.0;
        }
        else {
            isMatch = false;
            score = 0.12;
        }
    }
    if (isMatch) {
        addLog('POST', '/api/identity/identify', 200, 65, {
            verified: true,
            nin: p.ninNum,
            name: `${p.firstName} ${p.lastName}`,
            age,
            score,
        });
        state.player.firstName = p.firstName;
        state.player.lastName = p.lastName;
        state.player.phoneNumber = p.phoneNum;
        state.player.nin = p.ninNum;
        state.player.dateOfBirth = p.dobVal;
        state.player.age = age;
        state.player.kycStatus = 'verified';
        state.player.matchScore = score;
        saveState(state);
        window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
        result.hidden = false;
        result.innerHTML = `
      <div class="success" style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 8px;">
        <div>
          <strong>✓ NIN &amp; Age Verified (100% Match)</strong><br/>
          Identity confirmed for <strong>${p.firstName} ${p.lastName}</strong> (${age} yrs).
        </div>
        <button type="button" id="btn-next-step2" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; font-weight: 800; padding: 12px; margin-top: 4px;">
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
        addLog('POST', '/api/identity/identify', 400, 55, {
            verified: false,
            error: `Name mismatch for NIN ${p.ninNum}`,
            score,
        });
        result.hidden = false;
        result.innerHTML = `
      <div class="error" style="padding: 14px; border-radius: 8px;">
        <strong>✗ Name Mismatch</strong><br/>
        The name "${p.firstName} ${p.lastName}" does not match the record for NIN ${p.ninNum}.
      </div>
    `;
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
        const ts = `// Step 2: Check that BVN belongs to the registered player
const check = await ninja.identity.identify({
  idType: 'bvn',
  mode: 'verify',
  idNumber: '${bvnNum}',
  firstName: '${state.player.firstName}',
  lastName: '${state.player.lastName}',
})

if (check.verified) {
  console.log('Bank account verified and saved!')
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
        showCodeFirstSlideOut({
            title: 'POST /api/identity/identify',
            endpoint: '/api/identity/identify',
            method: 'POST',
            description: 'Ninja verifies that the bank account BVN belongs to the registered player.',
            curl,
            ts,
            python,
            go,
            confirmLabel: 'Noted, Proceed →',
            onProceed: async () => {
                await executeStep2({ bankName, accNum, bvnNum, holderName });
            },
        });
    });
}
async function executeStep2(p) {
    const result = document.getElementById('step2-result');
    if (!result)
        return;
    const isMatch = p.holderName.toLowerCase().includes(state.player.firstName.toLowerCase()) &&
        p.bvnNum === '77777777777';
    if (isMatch) {
        addLog('POST', '/api/identity/identify', 200, 85, {
            verified: true,
            bank: p.bankName,
            accountNumber: p.accNum,
            bvn: p.bvnNum,
        });
        try {
            await api.saveBankDetails({ bank_name: p.bankName, account_number: p.accNum });
        }
        catch { }
        state.bankAccount = {
            bankName: p.bankName,
            accountNumber: p.accNum,
            bvn: p.bvnNum,
            isVerified: true,
        };
        saveState(state);
        result.hidden = false;
        result.innerHTML = `
      <div class="success" style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 8px;">
        <div>
          <strong>✓ Bank Account Saved!</strong><br/>
          BVN belongs to <strong>${state.player.firstName} ${state.player.lastName}</strong>.
        </div>
        <button type="button" id="btn-next-step3" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; font-weight: 800; padding: 12px; margin-top: 4px;">
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
        addLog('POST', '/api/identity/identify', 400, 70, {
            verified: false,
            error: `Account name "${p.holderName}" does not match player "${state.player.firstName} ${state.player.lastName}"`,
        });
        result.hidden = false;
        result.innerHTML = `
      <div class="error" style="padding: 14px; border-radius: 8px;">
        <strong>✗ Bank Account Rejected</strong><br/>
        This bank account belongs to "<strong>${p.holderName}</strong>", not the registered player (${state.player.firstName} ${state.player.lastName}).
      </div>
    `;
    }
}
// -----------------------------------------------------------------------------
// Step 3: Withdraw Cash (Face Check with Prefilled Name & DOB)
// -----------------------------------------------------------------------------
function bindStep3() {
    const scenCards = document.querySelectorAll('.scenario-card-btn');
    const genBtn = document.getElementById('btn-generate-flow-link');
    const linkBox = document.getElementById('step3-link-box');
    const openLink = document.getElementById('link-open-camera');
    const urlText = document.getElementById('text-flow-url');
    const simPass = document.getElementById('btn-sim-pass');
    const simFail = document.getElementById('btn-sim-fail');
    const releaseBox = document.getElementById('step3-release-box');
    const releaseBtn = document.getElementById('btn-release-payout');
    const receipt = document.getElementById('step3-receipt');
    // Scenario toggle
    scenCards.forEach((card) => {
        card.addEventListener('click', () => {
            scenCards.forEach((c) => c.classList.remove('active'));
            card.classList.add('active');
            selectedScenario = card.dataset.scenario || 'prefilled';
            state.withdrawal.scenario = selectedScenario;
            saveState(state);
            updateDevCode();
        });
    });
    // Generate Link -> Code-First Slide-Out
    genBtn?.addEventListener('click', () => {
        const config = getLinkScenarioConfig(selectedScenario, `${state.player.firstName} ${state.player.lastName}`, state.player.id, 'wtd_01', state.player.firstName, state.player.lastName, state.player.dateOfBirth || '1975-01-01');
        showCodeFirstSlideOut({
            title: `POST /api/flows/${config.flowId}/links`,
            endpoint: `/api/flows/${config.flowId}/links`,
            method: 'POST',
            description: 'Creates a single-use link for live camera selfie verification with First Name, Surname, and DOB pre-filled.',
            curl: config.curl,
            ts: config.ts,
            python: config.python,
            go: config.go,
            confirmLabel: 'Noted, Proceed →',
            onProceed: async () => {
                let url = 'https://www.ninja.ng/kyc/?t=cylCDuxTXE5VnfIag1R6KrodUqfjqem9oyWAIplO';
                try {
                    const res = await api.startFaceVerification({ user_bet_id: 'wtd_01' });
                    if (res && res.verification_url) {
                        url = res.verification_url;
                    }
                }
                catch {
                    url = 'https://www.ninja.ng/kyc/?t=cylCDuxTXE5VnfIag1R6KrodUqfjqem9oyWAIplO';
                }
                addLog('POST', `/api/flows/${config.flowId}/links`, 200, 90, {
                    link: url,
                    scenario: selectedScenario,
                    prefilled_values: {
                        first_name: state.player.firstName,
                        last_name: state.player.lastName,
                        date_of_birth: state.player.dateOfBirth || '1975-01-01',
                    },
                });
                state.withdrawal.verificationUrl = url;
                state.withdrawal.faceStatus = 'pending';
                saveState(state);
                if (linkBox)
                    linkBox.hidden = false;
                if (urlText)
                    urlText.textContent = url;
                if (openLink) {
                    openLink.href = url;
                    openLink.onclick = (e) => {
                        e.preventDefault();
                        window.open(url, '_blank', 'width=480,height=680');
                    };
                }
            },
        });
    });
    // Simulate Face Matched
    simPass?.addEventListener('click', async () => {
        state.withdrawal.faceStatus = 'passed';
        saveState(state);
        try {
            await api.simulateFaceVerificationOutcome('passed');
        }
        catch { }
        addLog('POST', '/api/webhooks/ninja', 200, 30, {
            event: 'face.verified',
            score: 0.98,
            status: 'passed',
        });
        if (releaseBox)
            releaseBox.hidden = false;
    });
    // Simulate Face Mismatch
    simFail?.addEventListener('click', async () => {
        state.withdrawal.faceStatus = 'failed';
        saveState(state);
        try {
            await api.simulateFaceVerificationOutcome('failed');
        }
        catch { }
        addLog('POST', '/api/webhooks/ninja', 400, 30, {
            event: 'face.failed',
            score: 0.35,
            status: 'failed',
        });
        if (releaseBox)
            releaseBox.hidden = true;
        alert('Face check failed: Live selfie does not match the registered player on file.');
    });
    // Send Money
    releaseBtn?.addEventListener('click', () => {
        const amt = state.withdrawal.amountNaira;
        state.player.walletBalanceNaira = Math.max(0, state.player.walletBalanceNaira - amt);
        saveState(state);
        window.dispatchEvent(new CustomEvent('ninjabet:statechange'));
        try {
            confetti({ particleCount: 90, spread: 60, origin: { y: 0.7 } });
        }
        catch { }
        addLog('POST', '/api/payouts/send', 200, 120, {
            amount: amt,
            beneficiary: `${state.player.firstName} ${state.player.lastName}`,
            bank: state.bankAccount?.bankName || 'Access Bank',
            status: 'SENT',
        });
        if (receipt) {
            receipt.hidden = false;
            receipt.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 16px; margin-top: 14px;">
          <h4 style="margin: 0 0 6px; color: #34d399; font-size: 15px;">🎉 Money Sent Successfully!</h4>
          <p style="margin: 0 0 12px; font-size: 13px; color: #cbd5e1;">
            <strong>${formatNaira(amt)}</strong> has been transferred to <strong>${state.player.firstName} ${state.player.lastName}</strong> (${state.bankAccount?.bankName || 'Access Bank'} - ${state.bankAccount?.accountNumber || '0123456789'}).
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
// Live Code Inspector & Telemetry
// -----------------------------------------------------------------------------
function bindDevTools() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            activeTab = target.dataset.tab || 'curl';
            updateDevCode();
        });
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
        navigator.clipboard.writeText(text).then(() => {
            if (statusText)
                statusText.textContent = '✓ Copied!';
            setTimeout(() => {
                if (statusText)
                    statusText.textContent = '📋 Copy Snippet';
            }, 1800);
        }).catch(() => {
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
            snippet = `// Step 1: NIN Verification
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
            snippet = `# Step 1: NIN Verification
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
            snippet = `// Step 1: NIN Verification
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
            snippet = `// Step 2: BVN Match
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
            snippet = `# Step 2: BVN Match
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={"idType": "bvn", "mode": "verify", "idNumber": "${bvn}", "firstName": "${fn}", "lastName": "${ln}"}
)`;
        }
        else {
            lang = 'go';
            snippet = `// Step 2: BVN Match
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
        const cfg = getLinkScenarioConfig(selectedScenario, `${state.player.firstName} ${state.player.lastName}`, state.player.id, 'wtd_01', state.player.firstName, state.player.lastName, state.player.dateOfBirth || '1975-01-01');
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
    if (endpointEl)
        endpointEl.textContent = endpoint;
    codeEl.className = `language-${lang}`;
    codeEl.innerHTML = Prism.highlight(snippet, Prism.languages[lang] || Prism.languages.javascript, lang);
}
function addLog(method, endpoint, status, durationMs, data) {
    const log = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        method,
        endpoint,
        status,
        durationMs,
        requestPayload: {},
        responsePayload: data,
        summary: `${status} · ${endpoint}`,
    };
    state.logs.unshift(log);
    if (state.logs.length > 20)
        state.logs.pop();
    saveState(state);
    renderLogs();
}
function renderLogs() {
    const list = document.getElementById('dev-call-log-list');
    if (!list)
        return;
    if (state.logs.length === 0) {
        list.innerHTML = `
      <div style="font-size: 11.5px; color: var(--muted); text-align: center; padding: 16px;" id="empty-logs-label">
        No API calls made yet. Click any button on the left.
      </div>
    `;
        return;
    }
    list.innerHTML = state.logs
        .map((l) => `
    <div class="api-log-item">
      <span class="api-log-method">${l.method}</span>
      <code class="api-log-path">${l.endpoint}</code>
      <div class="api-log-meta">
        <span class="api-log-time">${l.timestamp}</span>
        <span class="api-log-status api-log-status-${l.status === 200 ? '200' : '400'}">${l.status}</span>
      </div>
    </div>
  `)
        .join('');
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
