import { api } from './lib/api.js';

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function pretty(raw) {
    if (!raw.Valid || !raw.String)
        return '';
    try {
        return JSON.stringify(JSON.parse(raw.String), null, 2);
    }
    catch {
        return raw.String;
    }
}
const TRUNCATE_LINES = 3;
// Long request/response bodies get collapsed to the first 3 lines with a
// "View more" toggle — full-page dumps of every log entry were making the
// list unusable.
function renderTruncatable(text) {
    if (!text)
        return '<pre></pre>';
    const lines = text.split('\n');
    if (lines.length <= TRUNCATE_LINES) {
        return `<pre>${escapeHtml(text)}</pre>`;
    }
    const truncated = lines.slice(0, TRUNCATE_LINES).join('\n');
    const moreLabel = `View more (${lines.length - TRUNCATE_LINES} more lines)`;
    return `
    <pre class="truncated-pre">${escapeHtml(truncated)}</pre>
    <pre class="full-pre" hidden>${escapeHtml(text)}</pre>
    <button type="button" class="view-more-btn" data-more-label="${escapeHtml(moreLabel)}">${escapeHtml(moreLabel)}</button>
  `;
}
const refreshBtn = document.getElementById('refresh-btn');
const logsEl = document.getElementById('logs');
async function load() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    try {
        // Go's encoding/json marshals a nil slice as `null` — ListRecentAPILogs
        // returns nil when there are zero rows.
        const logs = (await api.callLog()) ?? [];
        logsEl.innerHTML =
            logs.length === 0
                ? '<p class="hint">No calls yet — onboard a customer first.</p>'
                : logs
                    .map((log) => `
      <div class="card log-entry">
        <div class="log-header">
          <strong>${escapeHtml(log.Method)} ${escapeHtml(log.Endpoint)}</strong>
          <span class="${log.StatusCode < 300 ? 'success' : 'error'}">${log.StatusCode}</span>
          <span class="hint">${log.DurationMs}ms</span>
          ${log.IsMock ? '<span class="badge">MOCK FALLBACK</span>' : ''}
          <span class="hint">${escapeHtml(log.CreatedAt)}</span>
        </div>
        <div class="log-body">
          <div><h4>Request</h4>${renderTruncatable(pretty(log.RequestPayload))}</div>
          <div><h4>Response</h4>${renderTruncatable(pretty(log.ResponsePayload))}</div>
        </div>
      </div>`)
                    .join('');
    }
    finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
    }
}
logsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-more-btn');
    if (!btn)
        return;
    const wrapper = btn.parentElement;
    const truncatedPre = wrapper.querySelector('.truncated-pre');
    const fullPre = wrapper.querySelector('.full-pre');
    const showingFull = !fullPre.hidden;
    fullPre.hidden = showingFull;
    truncatedPre.hidden = !showingFull;
    btn.textContent = showingFull ? btn.dataset.moreLabel : 'Show less';
});
refreshBtn.addEventListener('click', load);
load();
