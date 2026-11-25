// Shared UI building blocks: icons, status badges, formatting, banners and form errors.

import { html, raw, setHtml } from './html.js';
import { TONE, STOCK_LABEL, expiryLabel } from './status-text.js';

const PATHS = {
  // Status icons use three distinct shapes so status is readable without colour.
  ok: '<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-6.5"/>',
  warn: '<path d="M12 3.5 22 20.5H2z"/><path d="M12 10v4.5"/><path d="M12 17.6v.01"/>',
  crit: '<path d="M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2l-5.7-5.7V8.2z"/><path d="M9 9l6 6M15 9l-6 6"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5"/><path d="M12 7.5v.01"/>',
  neutral: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  inventory: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  label: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  activity: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  archive: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  adjust: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  drop: '<path d="M12 3.5c3 3.6 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.9 6-10.5z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  logo: '<path d="M9 3h6"/><path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
};

export function icon(name, cls = 'icon') {
  return raw(
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] ?? ''}</svg>`,
  );
}

export function badge(tone, text) {
  return html`<span class="badge badge-${tone}">${icon(tone)}<span>${text}</span></span>`;
}

export const stockBadge = (m) => badge(TONE[m.stockStatus], STOCK_LABEL[m.stockStatus]);
export const expiryBadge = (m) => badge(TONE[m.expiryStatus], expiryLabel(m.expiryStatus, m.daysUntilExpiry));

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

export function formatDateTime(iso) {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}

// ---- Banners ---------------------------------------------------------------------------
let flash = null;

/** Queue a banner to show after the next navigation. */
export function setFlash(tone, message, actions = []) {
  flash = { tone, message, actions };
}

export function consumeFlash() {
  const f = flash;
  flash = null;
  if (f) showBanner(f.tone, f.message, f.actions);
}

/**
 * Shows a page-level banner. `actions` = [{ href, label }]. Errors use role="alert" so screen
 * readers announce them immediately; other tones are announced politely.
 */
export function showBanner(tone, message, actions = []) {
  const region = document.getElementById('banner-region');
  const role = tone === 'crit' ? 'alert' : 'status';
  setHtml(
    region,
    html`<div class="banner banner-${tone}" role="${role}">
      ${icon(tone === 'info' ? 'info' : tone)}
      <div class="banner-body">
        <p>${message}</p>
        ${actions.length ? html`<div class="banner-actions">${actions.map((a) => html`<a href="${a.href}">${a.label}</a>`)}</div>` : ''}
      </div>
      <button type="button" class="banner-close" aria-label="Dismiss message">${icon('close')}</button>
    </div>`,
  );
  region.querySelector('.banner-close').addEventListener('click', clearBanner);
}

export function clearBanner() {
  const region = document.getElementById('banner-region');
  if (region) region.innerHTML = '';
}

// ---- Form errors (WCAG 2.2 SC 3.3.1 error identification) --------------------------------

/** Field markup: label, optional hint, control, and a reserved error slot wired via aria-describedby. */
export function fieldError(name) {
  return html`<p class="field-error" id="err-${name}" hidden></p>`;
}

export function clearFieldErrors(form) {
  form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  const summary = form.querySelector('.error-summary');
  if (summary) summary.remove();
}

/**
 * Marks invalid fields and writes their messages. Returns the first invalid control.
 * `fields` = { name: message }. Unknown names (e.g. "form") are returned in `unplaced`.
 */
export function showFieldErrors(form, fields) {
  let first = null;
  const unplaced = [];
  for (const [name, message] of Object.entries(fields)) {
    const slot = form.querySelector(`#err-${CSS.escape(name)}`);
    const control = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!slot) {
      unplaced.push(message);
      continue;
    }
    setHtml(slot, html`${icon('crit')}<span>${message}</span>`);
    slot.hidden = false;
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      first ??= control;
    }
  }
  return { first, unplaced };
}

/** Error summary listing each problem with a link that moves focus to the field. */
export function renderErrorSummary(form, fields, labels) {
  const items = Object.entries(fields).filter(([name]) => form.querySelector(`[name="${CSS.escape(name)}"]`));
  if (!items.length) return null;
  const box = document.createElement('div');
  box.className = 'error-summary';
  box.setAttribute('role', 'alert');
  box.tabIndex = -1;
  setHtml(
    box,
    html`<h2>${items.length === 1 ? 'There is 1 problem' : `There are ${items.length} problems`} to fix</h2>
      <ul>
        ${items.map(([name, msg]) => html`<li><a href="#" data-field="${name}">${labels[name] ?? name}: ${msg}</a></li>`)}
      </ul>`,
  );
  box.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-field]');
    if (!link) return;
    e.preventDefault();
    form.querySelector(`[name="${CSS.escape(link.dataset.field)}"]`)?.focus();
  });
  form.prepend(box);
  return box;
}

export function errorState(err, { retry = true } = {}) {
  return html`<div class="card empty-state" role="alert">
    ${icon('crit')}
    <p><strong>${err.message || 'Something went wrong.'}</strong></p>
    ${retry ? html`<button type="button" class="btn btn-secondary" data-action="retry">Try again</button>` : ''}
  </div>`;
}

/** Applies data-width="NN" percentages after render (inline style attributes are blocked by CSP). */
export function applyWidths(root) {
  root.querySelectorAll('[data-width]').forEach((el) => {
    el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.width)))}%`;
  });
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
