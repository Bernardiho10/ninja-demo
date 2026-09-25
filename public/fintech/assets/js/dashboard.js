import { api, STATUS_LABEL, formatNaira, APIError } from './lib/api.js';
import { showErrorModal } from './lib/modal.js';

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const listEl = document.getElementById('customer-list');
const detailPanel = document.getElementById('detail-panel');
const emptyState = document.getElementById('empty-state');
const detailHeader = document.getElementById('detail-header');
const detailError = document.getElementById('detail-error');
const rekycBtn = document.getElementById('rekyc-btn');
const upgradeBtn = document.getElementById('upgrade-btn');
const transferForm = document.getElementById('transfer-form');
const transferBtn = document.getElementById('transfer-btn');
const transferResult = document.getElementById('transfer-result');
const historyEl = document.getElementById('transfer-history');
const field = (id) => document.getElementById(id);
let customers = [];
let selectedId = null;
const TRANSFER_STATUS_LABEL = {
    completed: 'Sent ✓',
    held_re_kyc: 'Held — re-KYC required',
    blocked_tier_limit: 'Blocked — over tier limit',
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
}
function renderList() {
    if (customers.length === 0) {
        listEl.innerHTML = `<p class="hint">No customers yet — onboard one to get started.</p>`;
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
    detailError.hidden = true;
    transferResult.hidden = true;
    detailHeader.innerHTML = `
    <h2 style="margin-top: 0">${escapeHtml(customer.full_name)}</h2>
    <p class="hint">${customer.id_type.toUpperCase()} ${escapeHtml(customer.id_number)} · DOB ${escapeHtml(customer.date_of_birth)}</p>
    <p><span class="badge badge-${customer.status}">${escapeHtml(STATUS_LABEL[customer.status] ?? customer.status)}</span>
       <span class="hint" style="margin-left: 8px">Last checked ${customer.score != null ? Math.round(customer.score * 100) + '% match' : '—'}</span></p>
    <div class="wallet-row" style="margin-top: 14px">
      <div>
        <span class="wallet-label">Tier</span>
        <span class="wallet-amount">${customer.tier}</span>
      </div>
      <div>
        <span class="wallet-label">Daily limit</span>
        <span class="wallet-amount">${formatNaira(customer.daily_limit_kobo)}</span>
      </div>
      <div>
        <span class="wallet-label">Balance</span>
        <span class="wallet-amount">${formatNaira(customer.balance_kobo)}</span>
      </div>
    </div>
  `;
    const canUpgrade = customer.status === 'onboarded' || customer.status === 're_kyc_cleared';
    upgradeBtn.disabled = !canUpgrade;
    upgradeBtn.title = canUpgrade ? '' : 'Needs a cleared verification before a tier upgrade';
    await loadTransfers(customer.id);
}
rekycBtn.addEventListener('click', async () => {
    if (!selectedId)
        return;
    rekycBtn.disabled = true;
    rekycBtn.textContent = 'Running…';
    detailError.hidden = true;
    try {
        await api.reKYC(selectedId);
        await loadCustomers();
    }
    catch (err) {
        const message = err instanceof APIError ? err.message : 'Re-KYC failed';
        detailError.textContent = message;
        detailError.hidden = false;
        showErrorModal(message, 'Re-KYC failed');
    }
    finally {
        rekycBtn.disabled = false;
        rekycBtn.textContent = 'Run re-KYC';
    }
});
upgradeBtn.addEventListener('click', async () => {
    if (!selectedId)
        return;
    upgradeBtn.disabled = true;
    upgradeBtn.textContent = 'Upgrading…';
    detailError.hidden = true;
    try {
        await api.upgradeTier(selectedId);
        await loadCustomers();
    }
    catch (err) {
        const message = err instanceof APIError ? err.message : 'Tier upgrade failed';
        detailError.textContent = message;
        detailError.hidden = false;
        showErrorModal(message, 'Tier upgrade failed');
    }
    finally {
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = 'Upgrade tier';
    }
});
transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedId)
        return;
    transferBtn.disabled = true;
    transferBtn.textContent = 'Sending…';
    transferResult.hidden = true;
    try {
        const res = await api.requestTransfer(selectedId, {
            amount_naira: Number(field('t_amount').value),
            recipient_name: field('t_name').value,
            recipient_bank: field('t_bank').value,
            recipient_account: field('t_account').value,
        });
        transferResult.className = res.status === 'completed' ? 'success' : 'error';
        transferResult.textContent = res.message;
        transferResult.hidden = false;
        if (res.status !== 'completed') {
            showErrorModal(res.message, res.status === 'held_re_kyc' ? 'Transfer held' : 'Transfer blocked');
        }
        await loadTransfers(selectedId);
    }
    catch (err) {
        const message = err instanceof APIError ? err.message : 'Transfer failed';
        transferResult.className = 'error';
        transferResult.textContent = message;
        transferResult.hidden = false;
        showErrorModal(message, 'Transfer failed');
    }
    finally {
        transferBtn.disabled = false;
        transferBtn.textContent = 'Send transfer';
    }
});
async function loadTransfers(customerId) {
    let transfers = [];
    try {
        transfers = (await api.listTransfers(customerId)) ?? [];
    }
    catch {
        historyEl.innerHTML = `<p class="error">Could not load transfer history.</p>`;
        return;
    }
    if (transfers.length === 0) {
        historyEl.innerHTML = `<p class="hint">No transfers yet.</p>`;
        return;
    }
    historyEl.innerHTML = transfers
        .map((t) => `
      <div class="transfer-row">
        <div>
          <div>${escapeHtml(t.RecipientName)} · ${escapeHtml(t.RecipientBank)}</div>
          <div class="transfer-row-meta">${escapeHtml(t.Reason)}</div>
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
