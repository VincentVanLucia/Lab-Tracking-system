// Access log for lab managers (R11): logins, sensitive changes and every rejected attempt.
import { api } from '../api.js';
import { html, setHtml } from '../html.js';
import { ROLE_LABELS } from '../session.js';
import { ACTION_LABEL } from '../status-text.js';
import { badge, formatDateTime, icon } from '../ui.js';

const OUTCOME = {
  allowed: { tone: 'ok', label: 'Allowed' },
  denied: { tone: 'crit', label: 'Denied' },
  failed: { tone: 'warn', label: 'Failed' },
};
const PAGE_SIZE = 50;

export async function render(root, { signal }) {
  let outcome = '';
  let offset = 0;

  setHtml(
    root,
    html`<div class="page-header">
        <div>
          <h1>Activity log</h1>
          <p class="lede">Logins, changes to materials, and every rejected attempt to access or modify the inventory.</p>
        </div>
      </div>
      <div class="card">
        <div class="field field-narrow">
          <label for="outcome">Show</label>
          <select id="outcome">
            <option value="">All events</option>
            <option value="denied">Denied (unauthorized attempts)</option>
            <option value="failed">Failed logins</option>
            <option value="allowed">Allowed</option>
          </select>
        </div>
        <div id="log"></div>
      </div>`,
  );

  const container = root.querySelector('#log');

  async function load() {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (outcome) qs.set('outcome', outcome);
    const data = await api(`/audit?${qs}`, { signal });
    const to = data.offset + data.items.length;
    setHtml(
      container,
      html`<p class="results-meta" aria-live="polite">Showing ${data.total ? data.offset + 1 : 0}–${to} of ${data.total} events</p>
        ${data.items.length
          ? html`<div class="table-wrap"><table class="data-table">
              <caption class="visually-hidden">Access log, newest first</caption>
              <thead><tr><th scope="col">When</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Details</th><th scope="col">Request</th></tr></thead>
              <tbody>
                ${data.items.map(
                  (e) => html`<tr>
                    <td class="cell-primary nowrap">${formatDateTime(e.createdAt)}</td>
                    <td data-label="User">${e.username ?? html`<span class="muted">Not logged in</span>`}${e.role ? html` <span class="muted small">(${ROLE_LABELS[e.role] ?? e.role})</span>` : ''}</td>
                    <td data-label="Action">${ACTION_LABEL[e.action] ?? e.action}</td>
                    <td data-label="Outcome">${badge(OUTCOME[e.outcome].tone, OUTCOME[e.outcome].label)}</td>
                    <td data-label="Details">${e.reason ?? '—'}</td>
                    <td data-label="Request" class="small"><code>${e.method} ${e.path}</code><div class="muted">${e.ip ?? ''}</div></td>
                  </tr>`,
                )}
              </tbody></table></div>`
          : html`<div class="empty-state">${icon('info')}<p>No events recorded.</p></div>`}
        ${data.total > PAGE_SIZE
          ? html`<div class="pager">
              <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${offset === 0 ? 'disabled' : ''}>${icon('back')}<span>Newer</span></button>
              <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${to >= data.total ? 'disabled' : ''}><span>Older</span>${icon('chevron')}</button>
            </div>`
          : ''}`,
    );
  }

  root.querySelector('#outcome').addEventListener('change', (e) => {
    outcome = e.target.value;
    offset = 0;
    load().catch(() => {});
  });
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn) return;
    offset = btn.dataset.page === 'next' ? offset + PAGE_SIZE : Math.max(0, offset - PAGE_SIZE);
    load().catch(() => {});
  });

  await load();
}
