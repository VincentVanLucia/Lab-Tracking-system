// Stock- and expiration-status dashboard with usage history (F8, R12).
import { api } from '../api.js';
import { html, setHtml } from '../html.js';
import { mountUsageHistory } from '../components/usage-history.js';
import { session } from '../session.js';
import { formatAmount } from '../status-text.js';
import { icon, stockBadge, expiryBadge, formatDate } from '../ui.js';

function tile({ tone, label, value, href, hint }) {
  return html`<a class="tile tile-${tone}" href="${href}">
    <span class="tile-head">${icon(tone)}<span>${label}</span></span>
    <span class="tile-value">${value}</span>
    ${hint ? html`<span class="tile-hint">${hint}</span>` : ''}
  </a>`;
}

function attentionTable(items) {
  if (!items.length) {
    return html`<div class="empty-state">${icon('ok')}<p><strong>All materials are in stock and within date.</strong></p></div>`;
  }
  return html`<div class="table-wrap">
    <table class="data-table">
      <caption class="visually-hidden">Materials that need attention, most urgent first</caption>
      <thead>
        <tr>
          <th scope="col">Material</th>
          <th scope="col">Stock status</th>
          <th scope="col">Expiration status</th>
          <th scope="col" class="t-right">Remaining</th>
          <th scope="col">Expires</th>
          <th scope="col">Location</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(
          (m) => html`<tr>
            <td class="cell-primary"><a href="#/materials/${m.id}">${m.name}</a> <span class="muted small">ID ${m.id}</span></td>
            <td data-label="Stock">${stockBadge(m)}</td>
            <td data-label="Expiry">${expiryBadge(m)}</td>
            <td data-label="Remaining" class="t-right num">${formatAmount(m.quantity, m.unit)}</td>
            <td data-label="Expires" class="nowrap">${formatDate(m.expirationDate)}</td>
            <td data-label="Location">${m.storageLocation ?? '—'}</td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

export async function render(root, { signal }) {
  const data = await api('/dashboard', { signal });
  const t = data.totals;
  const greetingName = session.user?.displayName ?? '';

  setHtml(
    root,
    html`<div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p class="lede">Hello ${greetingName}. Status as of ${formatDate(data.today)} · ${t.materials} materials registered · ${t.usageLast7Days} usage records in the last 7 days.</p>
        </div>
        <div class="actions">
          <a class="btn btn-primary" href="#/scan">${icon('scan')}<span>Scan a label</span></a>
          <a class="btn btn-secondary" href="#/inventory">${icon('search')}<span>Search inventory</span></a>
        </div>
      </div>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" class="visually-hidden">Summary</h2>
        <div class="tile-groups">
          <div class="tile-group">
            <h2>Stock status</h2>
            <div class="tiles">
              ${tile({ tone: 'ok', label: 'In Stock', value: t.stock.in_stock, href: '#/inventory?status=in_stock', hint: 'Above low-stock threshold' })}
              ${tile({ tone: 'warn', label: 'Low Stock', value: t.stock.low_stock, href: '#/inventory?status=low_stock', hint: 'Plan a reorder' })}
              ${tile({ tone: 'crit', label: 'Critical', value: t.stock.critical, href: '#/inventory?status=critical', hint: 'At or below critical level' })}
            </div>
          </div>
          <div class="tile-group">
            <h2>Expiration status</h2>
            <div class="tiles">
              ${tile({ tone: 'ok', label: 'Valid', value: t.expiry.valid, href: '#/inventory?status=valid', hint: 'Outside warning window' })}
              ${tile({ tone: 'warn', label: 'Expiring soon', value: t.expiry.expiring_soon, href: '#/inventory?status=expiring_soon', hint: 'Within warning window' })}
              ${tile({ tone: 'crit', label: 'Expired', value: t.expiry.expired, href: '#/inventory?status=expired', hint: 'Verify before any use' })}
            </div>
          </div>
        </div>
      </section>

      <section class="card" aria-labelledby="attention-heading">
        <div class="card-header">
          <h2 id="attention-heading">Needs attention (${t.needsAttention})</h2>
          ${t.needsAttention ? html`<a href="#/inventory?status=attention">Open in inventory table</a>` : ''}
        </div>
        ${attentionTable(data.attention)}
      </section>

      <section class="card" aria-labelledby="history-heading">
        <div class="card-header"><h2 id="history-heading">Usage history</h2></div>
        <div id="history"></div>
      </section>`,
  );

  await mountUsageHistory(root.querySelector('#history'), { signal }).load();
}
