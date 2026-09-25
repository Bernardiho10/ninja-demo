import { api, STATUS_LABEL, formatNaira, APIError } from './lib/api.js';
import { showErrorModal } from './lib/modal.js';

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const listEl = document.getElementById('customer-list');
const detailPanel = document.getElementById('detail-panel');
const emptyState = document.getElementById('empty-state');
const detailHeader = document.getElementById('detail-header');
const kycAlertBanner = document.getElementById('kyc-alert-banner');
const triggerVerifyBtn = document.getElementById('trigger-verify-btn');
const tabWithdraw = document.getElementById('tab-withdraw');
const tabKyc = document.getElementById('tab-kyc');
const viewWithdraw = document.getElementById('view-withdraw');
const viewKyc = document.getElementById('view-kyc');
const kycDetailsCard = document.getElementById('kyc-details-card');
const transferForm = document.getElementById('transfer-form');
const transferBtn = document.getElementById('transfer-btn');
const transferResult = document.getElementById('transfer-result');
const historyEl = document.getElementById('transfer-history');
const presetSelfBtn = document.getElementById('preset-withdraw-self');
const presetMismatchBtn = document.getElementById('preset-withdraw-mismatch');
const btnMaxAmount = document.getElementById('btn-max-amount');
const field = (id) => document.getElementById(id);
let customers = [];
let selectedId = null;
const TRANSFER_STATUS_LABEL = {
    completed: 'Disbursed ✓',
    held_re_kyc: 'Held — KYC Required',
    blocked_tier_limit: 'Blocked — Over Daily Limit',
};
async function loadCustomers() {
    try {
        customers = (await api.listCustomers()) ?? [];
    }
    catch (err) {
        listEl.innerHTML = `<p class="error">Could not load customers.</p>`;
        return;
    }
    renderList();
    if (selectedId && customers.some((c) => c.id === selectedId)) {
        renderDetail();
    }
    else if (customers.length > 0 && !selectedId) {
        selectedId = customers[0].id;
        renderList();
        renderDetail();
    }
}
function renderList() {
    if (customers.length === 0) {
        listEl.innerHTML = `<p class="hint">No customers yet &mdash; onboard one to get started.</p>`;
        return;
    }
    listEl.innerHTML = customers
        .map((c) => `
      <button class="customer-row${c.id === selectedId ? ' customer-row-selected' : ''}" data-id="${c.id}">
        <div class="customer-row-name">${escapeHtml(c.full_name)}</div>
        <div class="customer-row-meta">
          <span class="badge badge-${c.status}">${escapeHtml(STATUS_LABEL[c.status] ?? c.status)}</span>
          <span>Tier ${c.tier}</span>
        </div>
      </button>
    `)
        .join('');
    listEl.querySelectorAll('.customer-row').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedId = btn.dataset.id ?? null;
            renderList();
            renderDetail();
        });
    });
}
async function renderDetail() {
    const customer = customers.find((c) => c.id === selectedId);
    if (!customer) {
        detailPanel.hidden = true;
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;
    detailPanel.hidden = false;
    transferResult.hidden = true;
    const isFlagged = customer.status === 'flagged_review' || customer.status === 're_kyc_failed';
    kycAlertBanner.hidden = !isFlagged;
    const matchPercent = customer.score != null ? Math.round(customer.score * 100) : 0;
    const scoreClass = matchPercent >= 85 ? 'score-fill-high' : matchPercent >= 70 ? 'score-fill-med' : 'score-fill-low';
    detailHeader.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
      <div>
        <h2 style="margin: 0 0 4px; font-size: 22px;">${escapeHtml(customer.full_name)}</h2>
        <p class="hint" style="margin: 0; font-size: 12.5px;">
          ${customer.id_type.toUpperCase()} ${escapeHtml(customer.id_number)} &middot; DOB ${escapeHtml(customer.date_of_birth)}
        </p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button id="rekyc-btn" class="secondary" style="width: auto; padding: 6px 14px; font-size: 12px;">Verify KYC</button>
        <button id="upgrade-btn" class="secondary" style="width: auto; padding: 6px 14px; font-size: 12px;">Upgrade Tier</button>
      </div>
    </div>

    <div style="display: flex; gap: 12px; align-items: center; margin: 12px 0 6px;">
      <span class="badge badge-${customer.status}">${escapeHtml(STATUS_LABEL[customer.status] ?? customer.status)}</span>
      <span class="hint" style="font-size: 12px;">Ninja Identity Score: <strong>${matchPercent}% Match</strong> (${customer.recommendation})</span>
    </div>

    <div class="score-progress-bar">
      <div class="score-progress-fill ${scoreClass}" style="width: ${matchPercent}%"></div>
    </div>

    <div class="wallet-row" style="margin-top: 14px">
      <div>
        <span class="wallet-label">Account Tier</span>
        <span class="wallet-amount" style="font-size: 15px;">Tier ${customer.tier}</span>
      </div>
      <div>
        <span class="wallet-label">Daily Payout Limit</span>
        <span class="wallet-amount" style="font-size: 15px; color: #38bdf8;">${formatNaira(customer.daily_limit_kobo)}</span>
      </div>
      <div>
        <span class="wallet-label">Available Balance</span>
        <span class="wallet-amount" style="font-size: 15px; color: #34d399;">${formatNaira(customer.balance_kobo)}</span>
      </div>
    </div>
  `;
    // Wire header buttons
    const rekycBtn = document.getElementById('rekyc-btn');
    const upgradeBtn = document.getElementById('upgrade-btn');
    rekycBtn.addEventListener('click', () => showKycModal(customer));
    triggerVerifyBtn.onclick = () => showKycModal(customer);
    const canUpgrade = customer.status === 'onboarded' || customer.status === 're_kyc_cleared';
    upgradeBtn.disabled = !canUpgrade || customer.tier >= 3;
    upgradeBtn.textContent = customer.tier >= 3 ? 'Max Tier 3' : 'Upgrade Tier';
    upgradeBtn.title = canUpgrade ? 'Upgrade customer transaction tier' : 'Needs a cleared verification before tier upgrade';
    upgradeBtn.addEventListener('click', async () => {
        upgradeBtn.disabled = true;
        upgradeBtn.textContent = 'Upgrading…';
        try {
            await api.upgradeTier(customer.id);
            await loadCustomers();
        }
        catch (err) {
            const msg = err instanceof APIError ? err.message : 'Upgrade failed';
            showErrorModal(msg, 'Tier Upgrade Failed');
        }
        finally {
            upgradeBtn.disabled = false;
        }
    });
    // Set default recipient to customer self
    field('t_name').value = customer.full_name;
    // Render KYC breakdown tab view
    renderKycTabView(customer);
    await loadTransfers(customer.id);
}
function renderKycTabView(customer) {
    const fields = customer.fields ?? [
        { field: 'full_name', score: customer.score, match: customer.score >= 0.85 ? 'exact' : customer.score >= 0.7 ? 'fuzzy' : 'mismatch', provided: customer.full_name },
        { field: 'date_of_birth', score: 1.0, match: 'exact', provided: customer.date_of_birth },
        { field: 'id_number', score: 1.0, match: 'exact', provided: customer.id_number },
    ];
    kycDetailsCard.innerHTML = `
    <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 18px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h3 style="margin: 0; font-size: 15px;">Ninja Registry Match Audit</h3>
        <span class="badge badge-${customer.status}">${escapeHtml(STATUS_LABEL[customer.status] ?? customer.status)}</span>
      </div>
      <table class="fields">
        <thead>
          <tr>
            <th>Field</th>
            <th>Provided Value</th>
            <th>Match Confidence</th>
            <th>Match Score</th>
          </tr>
        </thead>
        <tbody>
          ${fields
        .map((f) => `
            <tr>
              <td><strong>${escapeHtml(f.field)}</strong></td>
              <td>${escapeHtml(f.provided)}</td>
              <td><span class="badge ${f.match === 'exact' ? 'badge-onboarded' : f.match === 'fuzzy' ? 'badge-flagged_review' : 'badge-re_kyc_failed'}">${escapeHtml(f.match)}</span></td>
              <td>${Math.round(f.score * 100)}%</td>
            </tr>
          `)
        .join('')}
        </tbody>
      </table>
      <div style="margin-top: 18px; display: flex; justify-content: space-between; align-items: center;">
        <p class="hint" style="margin: 0; font-size: 12px;">Last verified: ${new Date(customer.last_checked_at).toLocaleString()}</p>
        <button type="button" class="primary" id="reverify-tab-btn" style="width: auto; padding: 6px 16px; font-size: 12px;">
          Run Interactive Re-KYC
        </button>
      </div>
    </div>
  `;
    document.getElementById('reverify-tab-btn')?.addEventListener('click', () => showKycModal(customer));
}
function showKycModal(customer) {
    document.querySelector('.kyc-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'kyc-modal-overlay';
    const matchPct = Math.round(customer.score * 100);
    overlay.innerHTML = `
    <div class="kyc-modal-card" role="dialog" aria-modal="true">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 18px; color: #fff;">Ninja KYC Identity Verification</h3>
        <button type="button" id="close-modal-x" style="background: none; border: none; color: var(--muted); font-size: 20px; cursor: pointer; padding: 4px;">&times;</button>
      </div>

      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Customer Details</div>
        <div style="font-size: 16px; font-weight: 800; color: #fff;">${escapeHtml(customer.full_name)}</div>
        <div style="font-size: 12.5px; color: var(--muted);">${customer.id_type.toUpperCase()}: ${escapeHtml(customer.id_number)} &middot; DOB: ${escapeHtml(customer.date_of_birth)}</div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 12px; color: var(--muted); font-weight: 700; text-transform: uppercase;">Ninja Resolution Confidence</span>
          <strong style="color: #38bdf8;">${matchPct}% Match</strong>
        </div>
        <div class="score-progress-bar">
          <div class="score-progress-fill score-fill-high" style="width: ${matchPct}%"></div>
        </div>
      </div>

      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px 14px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #34d399; font-size: 18px;">📸</span>
          <div>
            <strong style="color: #34d399; font-size: 13px; display: block;">Simulated Liveness &amp; Facial Match</strong>
            <span style="color: var(--muted); font-size: 11.5px;">Live selfie matches government NIN registry photo with 99.2% biometric certainty.</span>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <button type="button" id="modal-approve-btn" class="primary" style="padding: 12px; font-weight: 800; font-size: 13.5px;">
          Approve &amp; Clear Verification ✓
        </button>
        <button type="button" id="modal-reject-btn" class="secondary" style="padding: 12px; font-weight: 700; font-size: 13.5px; color: #f87171; border-color: rgba(239, 68, 68, 0.4);">
          Reject Verification ✗
        </button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    function close() {
        overlay.remove();
    }
    document.getElementById('close-modal-x')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            close();
    });
    document.getElementById('modal-approve-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('modal-approve-btn');
        btn.disabled = true;
        btn.textContent = 'Clearing...';
        try {
            await api.reKYC(customer.id, 'cleared');
            close();
            await loadCustomers();
        }
        catch (err) {
            showErrorModal('Failed to complete re-KYC', 'Verification Error');
        }
    });
    document.getElementById('modal-reject-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('modal-reject-btn');
        btn.disabled = true;
        btn.textContent = 'Flagging...';
        try {
            await api.reKYC(customer.id, 'failed');
            close();
            await loadCustomers();
        }
        catch (err) {
            showErrorModal('Failed to update status', 'Verification Error');
        }
    });
}
// Tab Switching
tabWithdraw.addEventListener('click', () => {
    tabWithdraw.classList.add('active');
    tabKyc.classList.remove('active');
    viewWithdraw.hidden = false;
    viewKyc.hidden = true;
});
tabKyc.addEventListener('click', () => {
    tabKyc.classList.add('active');
    tabWithdraw.classList.remove('active');
    viewKyc.hidden = false;
    viewWithdraw.hidden = true;
});
// Preset buttons
presetSelfBtn.addEventListener('click', () => {
    const customer = customers.find((c) => c.id === selectedId);
    if (customer) {
        field('t_name').value = customer.full_name;
        field('t_account').value = '0123456789';
    }
});
presetMismatchBtn.addEventListener('click', () => {
    field('t_name').value = 'Tony Stark (Fraudulent Beneficiary)';
    field('t_account').value = '9998887776';
});
// Amount chips
document.querySelectorAll('.preset-chip[data-amt]').forEach((chip) => {
    chip.addEventListener('click', () => {
        field('t_amount').value = chip.dataset.amt || '50000';
    });
});
btnMaxAmount.addEventListener('click', () => {
    const customer = customers.find((c) => c.id === selectedId);
    if (customer) {
        const maxAllowed = Math.min(customer.balance_kobo, customer.daily_limit_kobo) / 100;
        field('t_amount').value = String(maxAllowed);
    }
});
// Withdrawal Form Submit
transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedId)
        return;
    transferBtn.disabled = true;
    transferBtn.textContent = 'Verifying with Ninja API & Processing…';
    transferResult.hidden = true;
    try {
        const res = await api.requestTransfer(selectedId, {
            amount_naira: Number(field('t_amount').value),
            recipient_name: field('t_name').value,
            recipient_bank: document.getElementById('t_bank').value,
            recipient_account: field('t_account').value,
        });
        transferResult.className = res.status === 'completed' ? 'success' : 'error';
        transferResult.textContent = res.message;
        transferResult.hidden = false;
        if (res.status !== 'completed') {
            showErrorModal(res.message, res.status === 'held_re_kyc' ? 'Withdrawal Held for Review' : 'Withdrawal Blocked');
        }
        await loadCustomers();
        await loadTransfers(selectedId);
    }
    catch (err) {
        const message = err instanceof APIError ? err.message : 'Withdrawal request failed';
        transferResult.className = 'error';
        transferResult.textContent = message;
        transferResult.hidden = false;
        showErrorModal(message, 'Withdrawal Failed');
    }
    finally {
        transferBtn.disabled = false;
        transferBtn.textContent = 'Confirm & Withdraw Funds';
    }
});
async function loadTransfers(customerId) {
    let transfers = [];
    try {
        transfers = (await api.listTransfers(customerId)) ?? [];
    }
    catch {
        historyEl.innerHTML = `<p class="error">Could not load withdrawal history.</p>`;
        return;
    }
    if (transfers.length === 0) {
        historyEl.innerHTML = `<p class="hint">No withdrawals recorded yet.</p>`;
        return;
    }
    historyEl.innerHTML = transfers
        .map((t) => `
      <div class="transfer-row">
        <div>
          <div style="font-weight: 700; color: #fff;">${escapeHtml(t.RecipientName)} &middot; <span style="color: var(--muted);">${escapeHtml(t.RecipientBank)} (${escapeHtml(t.RecipientAccount)})</span></div>
          <div class="transfer-row-meta" style="margin-top: 3px;">${escapeHtml(t.Reason)}</div>
        </div>
        <div style="text-align: right">
          <div class="transfer-row-amount">${formatNaira(t.AmountKobo)}</div>
          <span class="badge badge-${t.Status}">${escapeHtml(TRANSFER_STATUS_LABEL[t.Status] ?? t.Status)}</span>
        </div>
      </div>
    `)
        .join('');
}
loadCustomers();
