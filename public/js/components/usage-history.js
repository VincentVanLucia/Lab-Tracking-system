// Paginated usage history (R5, R12): who used how much of what, and when.
import { api } from '../api.js';
import { html, setHtml } from '../html.js';
import { TX_LABEL, formatAmount } from '../status-text.js';
import { badge, formatDateTime, icon } from '../ui.js';

const TYPE_TONE = { usage: 'info', registration: 'neutral', restock: 'ok', correction: 'warn' };

function changeText(t) {
  const sign = t.change > 0 ? '+' : t.change < 0 ? '−' : '±';
  return `${sign}${formatAmount(Math.abs(t.change), t.unit)}`;
}

export function usageTable(items, { showMaterial = true } = {}) {
  if (!items.length) {
    return html`<div class="empty-state">${icon('info')}<p>No transactions recorded yet.</p></div>`;
  }
  return html`<div class="table-wrap">
    <table class="data-table">
      <caption class="visually-hidden">Usage and stock transactions, newest first</caption>
      <thead>
        <tr>
          ${showMaterial ? html`<th scope="col">Material</th>` : ''}
          <th scope="col">Date &amp; time</th>
          <th scope="col">Type</th>
          <th scope="col" class="t-right">Amount</th>
          <th scope="col" class="t-right">Remaining</th>
          <th scope="col">User</th>
          <th scope="col">Note</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(
          (t) => html`<tr>
            ${showMaterial
              ? html`<td class="cell-primary"><a href="#/materials/${t.materialId}">${t.materialName}</a> <span class="muted small">ID ${t.materialId}</span></td>`
              : ''}
            <td data-label="When" class="nowrap">${formatDateTime(t.createdAt)}</td>
            <td data-label="Type">${badge(TYPE_TONE[t.type] ?? 'neutral', TX_LABEL[t.type] ?? t.type)}</td>
            <td data-label="Amount" class="t-right num nowrap ${t.change < 0 ? 'change-neg' : 'change-pos'}">${changeText(t)}</td>
            <td data-label="Remaining" class="t-right num nowrap">${formatAmount(t.quantityAfter, t.unit)}</td>
            <td data-label="User">${t.user.displayName} <span class="muted small">(${t.user.username})</span></td>
            <td data-label="Note">${t.note ?? html`<span class="muted">—</span>`}</td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/**
 * Mounts a self-contained, paginated history section into `container`.
 * Options: materialId (filter to one material), pageSize, showTypeFilter, signal.
 */
export function mountUsageHistory(container, { materialId = '', pageSize = 25, showTypeFilter = true, signal } = {}) {
  let offset = 0;
  let type = 'usage';

  async function load() {
    const qs = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (materialId) qs.set('materialId', materialId);
    if (type) qs.set('type', type);
    const data = await api(`/usage?${qs}`, { signal });
    const from = data.total ? data.offset + 1 : 0;
    const to = data.offset + data.items.length;
    setHtml(
      container,
      html`${showTypeFilter
          ? html`<div class="field field-narrow">
              <label for="history-type-${materialId || 'all'}">Show</label>
              <select id="history-type-${materialId || 'all'}" data-role="type">
                <option value="usage" ${type === 'usage' ? 'selected' : ''}>Usage transactions only</option>
                <option value="" ${type === '' ? 'selected' : ''}>All transactions (usage, restock, corrections, registrations)</option>
              </select>
            </div>`
          : ''}
        <p class="results-meta" aria-live="polite">Showing ${from}–${to} of ${data.total} ${type === 'usage' ? 'usage transactions' : 'transactions'}</p>
        ${usageTable(data.items, { showMaterial: !materialId })}
        ${data.total > pageSize
          ? html`<div class="pager">
              <button type="button" class="btn btn-secondary btn-sm" data-role="prev" ${offset === 0 ? 'disabled' : ''}>${icon('back')}<span>Newer</span></button>
              <span class="muted small">Page ${Math.floor(offset / pageSize) + 1} of ${Math.ceil(data.total / pageSize)}</span>
              <button type="button" class="btn btn-secondary btn-sm" data-role="next" ${to >= data.total ? 'disabled' : ''}><span>Older</span>${icon('chevron')}</button>
            </div>`
          : ''}`,
    );
  }

  container.addEventListener('change', (e) => {
    if (e.target.dataset.role !== 'type') return;
    type = e.target.value;
    offset = 0;
    load().then(() => container.querySelector('[data-role="type"]')?.focus()).catch(() => {});
  });
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-role]');
    if (!btn) return;
    offset = btn.dataset.role === 'next' ? offset + pageSize : Math.max(0, offset - pageSize);
    load()
      .then(() => container.querySelector(`[data-role="${btn.dataset.role}"]:not(:disabled)`)?.focus() ?? container.querySelector('.results-meta')?.focus())
      .catch(() => {});
  });

  return { load, reload: () => load() };
}
