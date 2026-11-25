// Material registration form (F1, R6, R8) — also used to edit an existing material.
// Mandatory fields are labelled "(required)" in text (WCAG 2.2 SC 3.3.2) and validated with the
// same rules as the server before submission (SC 3.3.1).
import { api, getMeta } from '../api.js';
import { html, raw, setHtml } from '../html.js';
import { go } from '../nav.js';
import { icon, fieldError, clearFieldErrors, showFieldErrors, renderErrorSummary, setFlash } from '../ui.js';
import { validateMaterial } from '/shared/validation.js';

const LABELS = {
  id: 'Material ID',
  name: 'Material name',
  category: 'Category',
  lotNumber: 'Lot number',
  supplier: 'Supplier',
  initialQuantity: 'Quantity',
  unit: 'Unit',
  lowStockThreshold: 'Low-stock threshold',
  criticalStockThreshold: 'Critical threshold',
  expiryWarningDays: 'Expiry warning',
  openingDate: 'Opening date',
  expirationDate: 'Expiration date',
  storageCondition: 'Storage condition',
  storageLocation: 'Storage location',
  notes: 'Notes',
};

const req = html`<span class="req">(required)</span>`;
const opt = html`<span class="opt">(optional)</span>`;

function textField({ name, label, value = '', required = false, hint = '', type = 'text', attrs = '', span = false, inputmode = '' }) {
  const describedBy = [hint ? `hint-${name}` : '', `err-${name}`].filter(Boolean).join(' ');
  return html`<div class="field ${span ? 'span-2' : ''}">
    <label for="f-${name}">${label} ${required ? req : opt}</label>
    <input id="f-${name}" name="${name}" type="${type}" value="${value ?? ''}" ${required ? 'required' : ''}
      ${inputmode ? html`inputmode="${inputmode}"` : ''} aria-describedby="${describedBy}" autocomplete="off" ${typeof attrs === 'string' ? raw(attrs) : attrs} />
    ${hint ? html`<p class="hint" id="hint-${name}">${hint}</p>` : ''}
    ${fieldError(name)}
  </div>`;
}

function amountField({ name, label, value, hint, unit }) {
  return html`<div class="field">
    <label for="f-${name}">${label} ${req}</label>
    <div class="input-unit">
      <input id="f-${name}" name="${name}" type="text" inputmode="decimal" value="${value ?? ''}" required
        autocomplete="off" aria-describedby="hint-${name} err-${name}" />
      <span class="unit" data-unit aria-hidden="true">${unit}</span>
    </div>
    <p class="hint" id="hint-${name}">${hint}</p>
    ${fieldError(name)}
  </div>`;
}

function selectField({ name, label, options, value, hint = '' }) {
  return html`<div class="field">
    <label for="f-${name}">${label} ${req}</label>
    <select id="f-${name}" name="${name}" required aria-describedby="${hint ? `hint-${name} ` : ''}err-${name}">
      <option value="">Choose…</option>
      ${options.map((o) => html`<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`)}
    </select>
    ${hint ? html`<p class="hint" id="hint-${name}">${hint}</p>` : ''}
    ${fieldError(name)}
  </div>`;
}

export async function render(root, { match, signal }) {
  const editId = match[1] ?? null;
  const meta = await getMeta();
  const today = meta.today;
  let m;
  let suggestedId = '';
  if (editId) {
    m = (await api(`/materials/${editId}`, { signal })).material;
  } else {
    suggestedId = (await api('/materials/next-id', { signal })).id;
    m = { openingDate: today, expiryWarningDays: meta.defaults.expiryWarningDays, unit: '' };
  }
  const unit = m.unit || '—';
  const title = editId ? `Edit ${m.name}` : 'Register material';

  setHtml(
    root,
    html`${editId ? html`<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/materials/${editId}">${icon('back')}<span>${m.name}</span></a></nav>` : ''}
      <div class="page-header">
        <div>
          <h1>${title}</h1>
          <p class="lede">Fields marked (required) must be filled in. ${editId ? 'To change the quantity, use “Adjust stock” on the material page.' : 'A printable QR label is available after saving.'}</p>
        </div>
      </div>

      <form id="material-form" novalidate>
        <fieldset class="form-section">
          <legend>Identification</legend>
          <div class="form-grid">
            ${editId
              ? html`<div class="field"><span class="label">Material ID</span><p class="num"><strong>${m.id}</strong> <span class="muted small">(cannot be changed — it is printed on the label)</span></p></div>`
              : textField({
                  name: 'id',
                  label: 'Material ID',
                  value: suggestedId,
                  inputmode: 'numeric',
                  hint: `4 digits, printed under the QR code. ${suggestedId} is the next free ID; leave blank to assign it automatically.`,
                  attrs: 'maxlength="4" pattern="\\d{4}"',
                })}
            ${textField({ name: 'name', label: 'Material name', value: m.name, required: true, hint: 'Include concentration or grade, e.g. "Taq DNA Polymerase (5 U/µL)".', attrs: 'maxlength="120"' })}
            ${selectField({ name: 'category', label: 'Category', value: m.category, options: meta.categories.map((c) => ({ value: c, label: c })) })}
            ${textField({ name: 'lotNumber', label: 'Lot number', value: m.lotNumber, attrs: 'maxlength="60"' })}
            ${textField({ name: 'supplier', label: 'Supplier', value: m.supplier, attrs: 'maxlength="120"', span: true })}
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend>Quantity and stock alerts</legend>
          <div class="form-grid">
            ${editId ? '' : amountField({ name: 'initialQuantity', label: 'Quantity received', value: m.initialQuantity, unit, hint: 'Amount in the container now. Up to 3 decimals.' })}
            ${selectField({ name: 'unit', label: 'Unit', value: m.unit, options: meta.units.map((u) => ({ value: u, label: u })), hint: 'Usage is recorded in this unit.' })}
            ${amountField({ name: 'lowStockThreshold', label: 'Low-stock threshold', value: m.lowStockThreshold, unit, hint: 'Show “Low Stock” (yellow) at or below this amount.' })}
            ${amountField({ name: 'criticalStockThreshold', label: 'Critical threshold', value: m.criticalStockThreshold, unit, hint: 'Show “Critical” (red) at or below this amount. Must not exceed the low-stock threshold.' })}
            ${textField({ name: 'expiryWarningDays', label: 'Expiry warning (days)', value: m.expiryWarningDays, inputmode: 'numeric', hint: `Show “Expires in N days” this many days before expiry. Default ${meta.defaults.expiryWarningDays}.`, attrs: 'maxlength="4"' })}
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend>Dates</legend>
          <div class="form-grid">
            ${textField({ name: 'openingDate', label: 'Opening date', type: 'date', value: m.openingDate, required: true, hint: 'The date the container was first opened (not in the future).', attrs: html`max="${today}"` })}
            ${textField({ name: 'expirationDate', label: 'Expiration date', type: 'date', value: m.expirationDate, required: true, hint: 'From the manufacturer label, or the in-use expiry after opening.' })}
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend>Storage</legend>
          <div class="form-grid">
            ${selectField({ name: 'storageCondition', label: 'Storage condition', value: m.storageCondition, options: meta.storageConditions })}
            ${textField({ name: 'storageLocation', label: 'Storage location', value: m.storageLocation, hint: 'e.g. Freezer A, rack 2', attrs: 'maxlength="120"' })}
            <div class="field span-2">
              <label for="f-notes">Notes ${opt}</label>
              <textarea id="f-notes" name="notes" maxlength="1000" aria-describedby="hint-notes err-notes">${m.notes ?? ''}</textarea>
              <p class="hint" id="hint-notes">Handling or safety notes, e.g. "Avoid repeated freeze–thaw cycles".</p>
              ${fieldError('notes')}
            </div>
          </div>
        </fieldset>

        <div class="form-actions">
          <a class="btn btn-secondary" href="${editId ? `#/materials/${editId}` : '#/inventory'}">Cancel</a>
          <button type="submit" class="btn btn-primary btn-lg">${editId ? 'Save changes' : 'Register material'}</button>
        </div>
      </form>`,
  );

  const form = root.querySelector('#material-form');

  // Keep the unit adornments in sync with the chosen unit.
  form.unit.addEventListener('change', () => {
    form.querySelectorAll('[data-unit]').forEach((el) => {
      el.textContent = form.unit.value || '—';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const data = Object.fromEntries(new FormData(form).entries());
    const { errors } = validateMaterial(data, { mode: editId ? 'update' : 'create', today });
    const fail = (fields) => {
      showFieldErrors(form, fields);
      const summary = renderErrorSummary(form, fields, LABELS);
      (summary ?? form.querySelector('[aria-invalid="true"]'))?.focus();
    };
    if (Object.keys(errors).length) {
      fail(errors);
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const result = editId
        ? await api(`/materials/${editId}`, { method: 'PUT', body: data })
        : await api('/materials', { method: 'POST', body: data });
      const saved = result.material;
      setFlash(
        'ok',
        editId ? `Saved changes to ${saved.name}.` : `Registered ${saved.name} with ID ${saved.id}.`,
        editId ? [] : [{ href: `#/labels?ids=${saved.id}`, label: 'Print its QR label' }, { href: '#/materials/new', label: 'Register another material' }],
      );
      go(`#/materials/${saved.id}`);
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) fail(err.fields);
      else {
        const box = document.createElement('div');
        box.className = 'error-summary';
        box.setAttribute('role', 'alert');
        box.textContent = err.message;
        form.prepend(box);
      }
    } finally {
      submit.disabled = false;
    }
  });
}
