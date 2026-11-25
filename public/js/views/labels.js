// Printable QR labels (F2): QR code with the material ID written under it (R1, §2.2).
import { api } from '../api.js';
import { html, raw, setHtml } from '../html.js';
import { icon, formatDate } from '../ui.js';

export async function render(root, { params, signal }) {
  const ids = (params.get('ids') ?? '').split(',').filter((s) => /^\d{4}$/.test(s));
  const data = await api(`/labels${ids.length ? `?ids=${ids.join(',')}` : ''}`, { signal });
  const labels = data.labels;

  setHtml(
    root,
    html`<div class="page-header no-print">
        <div>
          <h1>QR labels</h1>
          <p class="lede">${ids.length ? `${labels.length} selected ${labels.length === 1 ? 'label' : 'labels'}` : `All ${labels.length} active materials`}. Each label is 62 × 30 mm when printed.</p>
        </div>
        <div class="actions">
          ${ids.length ? html`<a class="btn btn-secondary" href="#/labels">Show all labels</a>` : ''}
          <button type="button" class="btn btn-primary" id="print">${icon('print')}<span>Print labels</span></button>
        </div>
      </div>
      <div class="banner banner-info no-print">
        ${icon('info')}
        <div class="banner-body"><p>The QR codes use the highest error-correction level (H), so they still scan when up to about 30% of the code is damaged. For freezers and wet areas, print on waterproof or cryo-resistant label stock. If a label still fails to scan, type the ID printed beside the code.</p></div>
      </div>
      <div class="labels-sheet" role="list" aria-label="QR labels">
        ${labels.length
          ? labels.map(
              (l) => html`<article class="qr-label" role="listitem" aria-label="Label for ${l.name}, ID ${l.id}">
                <div class="qr-code" role="img" aria-label="QR code encoding ${l.payload}">${raw(l.svg)}</div>
                <div class="qr-text">
                  <p class="qr-id">${l.id}</p>
                  <p class="qr-name">${l.name}</p>
                  <p class="qr-meta">${l.storageConditionLabel}</p>
                  <p class="qr-meta">Exp ${formatDate(l.expirationDate)}${l.lotNumber ? ` · Lot ${l.lotNumber}` : ''}</p>
                </div>
              </article>`,
            )
          : html`<div class="card empty-state">${icon('info')}<p>No materials to label yet.</p></div>`}
      </div>`,
  );

  root.querySelector('#print').addEventListener('click', () => window.print());
}
