import { api, formatNaira } from './lib/api.js';

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const refreshBtn = document.getElementById('refresh-btn');
const groupsEl = document.getElementById('groups');
async function load() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    try {
        const [groups, impact] = await Promise.all([api.fraudSignals(), api.impact()]);
        document.getElementById('impact-duplicates').textContent = String(impact.DuplicateAccountsBlocked ?? 0);
        document.getElementById('impact-duplicates-label').textContent =
            `duplicate accounts, ${formatNaira(impact.BonusFraudPreventedKobo ?? 0)} not paid`;
        document.getElementById('impact-mismatch').textContent = String(impact.ImpersonationAttempts ?? 0);
        document.getElementById('impact-payout-fraud').textContent = String(impact.PayoutFraudAttempts ?? 0);
        document.getElementById('impact-payout-fraud-label').textContent =
            `payouts blocked, ${formatNaira(impact.PayoutFraudPreventedKobo ?? 0)}`;
        groupsEl.innerHTML =
            groups.length === 0
                ? '<p class="hint">No duplicate identities on file.</p>'
                : groups
                    .map((g) => `
      <div class="card" style="margin-bottom: 16px">
        <h2>NIN ${escapeHtml(g.id_number)}</h2>
        <p class="hint">${g.accounts.length} accounts share this identity</p>
        <table class="fields">
          <thead><tr><th>Name</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            ${g.accounts
                    .map((a, i) => `
              <tr>
                <td>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</td>
                <td><span class="badge badge-${a.kyc_status}">${i === 0 ? 'first — bonus paid' : escapeHtml(a.kyc_status)}</span></td>
                <td>${escapeHtml(a.created_at)}</td>
              </tr>`)
                    .join('')}
          </tbody>
        </table>
      </div>`)
                    .join('');
    }
    finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
    }
}
refreshBtn.addEventListener('click', load);
load();
