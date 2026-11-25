// Material detail view + usage transaction dialog (F4, F5, R2, R5, R8), stock adjustment and
// archive dialogs for managers, and the R7 retrieval-time readout.
import { api } from '../api.js';
import { html, setHtml } from '../html.js';
import { go } from '../nav.js';
import { takeTiming } from '../perf.js';
import { session } from '../session.js';
import { TONE, STOCK_LABEL, formatAmount } from '../status-text.js';
import { mountUsageHistory } from '../components/usage-history.js';
import {
  icon,
  stockBadge,
  expiryBadge,
  formatDate,
  formatDateTime,
  showBanner,
  setFlash,
  fieldError,
  clearFieldErrors,
  showFieldErrors,
  applyWidths,
} from '../ui.js';
import { validateUsage, validateAdjustment } from '/shared/validation.js';

function notFound(id) {
  return html`<div class="card empty-state" role="alert">
    ${icon('crit')}
    <h1>Material ${id} was not found</h1>
    <p>The label may belong to a material that was archived, or the ID was mistyped.</p>
    <div class="actions">
      <a class="btn btn-primary" href="#/scan">${icon('scan')}<span>Scan again</span></a>
      <a class="btn btn-secondary" href="#/inventory">${icon('search')}<span>Search inventory</span></a>
    </div>
  </div>`;
}

function detailMarkup(m, { canUse, canEdit, canAdjust, canDelete, canLabel }) {
  const level = m.initialQuantity > 0 ? (m.quantity / m.initialQuantity) * 100 : 0;
  return html`<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/inventory">${icon('back')}<span>Inventory</span></a></nav>

    <div class="detail-head">
      <div>
        <p class="eyebrow">ID ${m.id} · ${m.category}</p>
        <h1>${m.name}</h1>
        <div class="badges">${stockBadge(m)} ${expiryBadge(m)}</div>
      </div>
      ${canEdit || canLabel || canDelete
        ? html`<div class="actions">
            ${canEdit ? html`<a class="btn btn-secondary" href="#/materials/${m.id}/edit">${icon('edit')}<span>Edit</span></a>` : ''}
            ${canLabel ? html`<a class="btn btn-secondary" href="#/labels?ids=${m.id}">${icon('print')}<span>Print label</span></a>` : ''}
            ${canDelete ? html`<button type="button" class="btn btn-secondary" data-open-dialog="archive-dialog">${icon('archive')}<span>Archive</span></button>` : ''}
          </div>`
        : ''}
    </div>

    <div class="grid-2">
      <section class="card stock-card" aria-labelledby="stock-heading">
        <h2 id="stock-heading">Remaining quantity</h2>
        <div class="qty-line">
          <span class="qty-value">${formatAmount(m.quantity)}</span><span class="qty-unit">${m.unit}</span>
          <span class="muted">of ${formatAmount(m.initialQuantity, m.unit)} registered</span>
        </div>
        <div class="level" role="img" aria-label="${STOCK_LABEL[m.stockStatus]}: ${Math.round(level)}% of the registered quantity remains">
          <div class="level-fill tone-${TONE[m.stockStatus]}" data-width="${level.toFixed(1)}"></div>
        </div>
        <p class="muted small">Low Stock at ${formatAmount(m.lowStockThreshold, m.unit)} or less · Critical at ${formatAmount(m.criticalStockThreshold, m.unit)} or less</p>
        <div class="bench-actions">
          ${canUse
            ? html`<button type="button" class="btn btn-primary btn-lg" data-open-dialog="usage-dialog" id="log-usage-btn" ${m.quantity <= 0 ? 'disabled' : ''}>${icon('drop')}<span>Log usage</span></button>`
            : html`<p class="muted small">Your role can view this material but not record usage.</p>`}
          ${canAdjust ? html`<button type="button" class="btn btn-secondary btn-lg" data-open-dialog="adjust-dialog">${icon('adjust')}<span>Adjust stock</span></button>` : ''}
        </div>
        ${m.quantity <= 0 ? html`<p class="field-error">${icon('crit')}<span>This material is used up. Ask a lab manager to restock it.</span></p>` : ''}
      </section>

      <section class="card" aria-labelledby="details-heading">
        <h2 id="details-heading">Details</h2>
        <dl class="kv">
          <dt>Material ID</dt><dd class="num"><strong>${m.id}</strong></dd>
          <dt>Category</dt><dd>${m.category}</dd>
          <dt>Opening date</dt><dd>${formatDate(m.openingDate)}</dd>
          <dt>Expiration date</dt><dd>${formatDate(m.expirationDate)} <span class="muted small">(warning ${m.expiryWarningDays} days before)</span></dd>
          <dt>Storage condition</dt><dd>${m.storageConditionLabel}</dd>
          <dt>Storage location</dt><dd>${m.storageLocation ?? '—'}</dd>
          <dt>Lot number</dt><dd>${m.lotNumber ?? '—'}</dd>
          <dt>Supplier</dt><dd>${m.supplier ?? '—'}</dd>
          <dt>Notes</dt><dd>${m.notes ?? '—'}</dd>
          <dt>Last updated</dt><dd>${formatDateTime(m.updatedAt)}</dd>
        </dl>
      </section>
    </div>

    <section class="card" aria-labelledby="mat-history-heading">
      <div class="card-header"><h2 id="mat-history-heading">Usage history</h2></div>
      <div id="mat-history"></div>
    </section>

    <p class="timing muted small" id="timing"></p>`;
}

function usageDialog(m) {
  const expired = m.expiryStatus === 'expired';
  return html`<dialog id="usage-dialog" aria-labelledby="usage-title">
    <form class="dialog-body" id="usage-form" novalidate>
      <h2 id="usage-title">Log usage</h2>
      <p class="muted">${m.name} · ID ${m.id}</p>
      <p class="available">Available now: <strong class="num">${formatAmount(m.quantity, m.unit)}</strong></p>
      ${expired
        ? html`<div class="banner banner-crit">${icon('crit')}<div class="banner-body"><p><strong>Expired on ${formatDate(m.expirationDate)}.</strong> Check that it is still suitable before using it.</p></div></div>
          <label class="checkbox"><input type="checkbox" name="confirmExpired" aria-describedby="err-confirmExpired" /><span>I have verified this expired material is suitable for my use.</span></label>
          ${fieldError('confirmExpired')}`
        : ''}
      <div class="field">
        <label for="usage-qty">Amount used <span class="req">(required)</span></label>
        <div class="input-unit">
          <input id="usage-qty" name="quantity" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done"
            required aria-describedby="usage-qty-hint err-quantity" data-dialog-focus />
          <span class="unit" aria-hidden="true">${m.unit}</span>
        </div>
        <p class="hint" id="usage-qty-hint">In ${m.unit}. Between 0 and ${formatAmount(m.quantity, m.unit)}; up to 3 decimals.</p>
        ${fieldError('quantity')}
      </div>
      <div class="field">
        <label for="usage-note">Note <span class="opt">(optional)</span></label>
        <input id="usage-note" name="note" type="text" maxlength="500" autocomplete="off" placeholder="Experiment or purpose" aria-describedby="err-note" />
        ${fieldError('note')}
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
        <button type="submit" class="btn btn-primary btn-lg">${icon('drop')}<span>Log usage</span></button>
      </div>
    </form>
  </dialog>`;
}

function adjustDialog(m) {
  return html`<dialog id="adjust-dialog" aria-labelledby="adjust-title">
    <form class="dialog-body" id="adjust-form" novalidate>
      <h2 id="adjust-title">Adjust stock</h2>
      <p class="muted">${m.name} · currently ${formatAmount(m.quantity, m.unit)}</p>
      <fieldset class="radio-group" aria-describedby="err-type">
        <legend class="label">Type of adjustment</legend>
        <label class="radio"><input type="radio" name="type" value="restock" checked /><span>Restock<small>Add a received amount to the current stock.</small></span></label>
        <label class="radio"><input type="radio" name="type" value="correction" /><span>Stock count correction<small>Set the stock to the amount physically counted.</small></span></label>
      </fieldset>
      ${fieldError('type')}
      <div class="field">
        <label for="adjust-qty" id="adjust-qty-label">Amount received <span class="req">(required)</span></label>
        <div class="input-unit">
          <input id="adjust-qty" name="quantity" type="text" inputmode="decimal" autocomplete="off" required aria-describedby="err-quantity" data-dialog-focus />
          <span class="unit" aria-hidden="true">${m.unit}</span>
        </div>
        ${fieldError('quantity')}
      </div>
      <div class="field">
        <label for="adjust-note">Reason <span class="opt" id="adjust-note-req">(optional for restock)</span></label>
        <input id="adjust-note" name="note" type="text" maxlength="500" autocomplete="off" placeholder="e.g. New bottle received, monthly physical count" aria-describedby="err-note" />
        ${fieldError('note')}
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
        <button type="submit" class="btn btn-primary">Save adjustment</button>
      </div>
    </form>
  </dialog>`;
}

function archiveDialog(m) {
  return html`<dialog id="archive-dialog" aria-labelledby="archive-title">
    <form class="dialog-body" id="archive-form">
      <h2 id="archive-title">Archive this material?</h2>
      <p><strong>${m.name}</strong> (ID ${m.id}) will be removed from the inventory and dashboard. Its usage history is kept, and its ID will not be reused.</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close-dialog data-dialog-focus>Cancel</button>
        <button type="submit" class="btn btn-danger">${icon('archive')}<span>Archive material</span></button>
      </div>
    </form>
  </dialog>`;
}

export async function render(root, { match, signal }) {
  const id = match[1];
  const perms = {
    canUse: session.can('usage.create'),
    canEdit: session.can('materials.update'),
    canAdjust: session.can('materials.adjust'),
    canDelete: session.can('materials.delete'),
    canLabel: session.can('labels.read'),
  };

  let material;
  try {
    material = (await api(`/materials/${id}`, { signal })).material;
  } catch (err) {
    if (err.status === 404) {
      takeTiming();
      setHtml(root, notFound(id));
      return;
    }
    throw err;
  }

  function draw(m) {
    setHtml(
      root,
      html`${detailMarkup(m, perms)} ${perms.canUse ? usageDialog(m) : ''} ${perms.canAdjust ? adjustDialog(m) : ''} ${perms.canDelete ? archiveDialog(m) : ''}`,
    );
    applyWidths(root);
    wire(m);
    return mountUsageHistory(root.querySelector('#mat-history'), { materialId: m.id, pageSize: 10, signal }).load();
  }

  async function refresh(focusId) {
    material = (await api(`/materials/${id}`, { signal })).material;
    await draw(material);
    if (focusId) root.querySelector(`#${focusId}`)?.focus();
  }

  function wire(m) {
    root.querySelectorAll('[data-open-dialog]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const dialog = root.querySelector(`#${btn.dataset.openDialog}`);
        const form = dialog.querySelector('form');
        form.reset();
        clearFieldErrors(form);
        dialog.showModal();
        dialog.querySelector('[data-dialog-focus]')?.focus();
      }),
    );
    root.querySelectorAll('[data-close-dialog]').forEach((btn) => btn.addEventListener('click', () => btn.closest('dialog').close()));

    // ---- Usage transaction dialog ----
    const usageForm = root.querySelector('#usage-form');
    usageForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(usageForm);
      const body = {
        materialId: m.id,
        quantity: usageForm.quantity.value,
        note: usageForm.note.value,
        confirmExpired: usageForm.confirmExpired ? usageForm.confirmExpired.checked : undefined,
      };
      const { errors } = validateUsage(body, m); // same rules as the server (R8)
      if (m.expiryStatus === 'expired' && !body.confirmExpired) {
        errors.confirmExpired = 'Tick the box to confirm you have verified this expired material is still suitable.';
      }
      if (Object.keys(errors).length) {
        showFieldErrors(usageForm, errors).first?.focus();
        return;
      }
      const submit = usageForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const result = await api('/usage', { method: 'POST', body });
        usageForm.closest('dialog').close();
        const after = result.material;
        const tone = TONE[after.stockStatus];
        await refresh('log-usage-btn');
        showBanner(
          tone === 'ok' ? 'ok' : tone,
          `Logged ${formatAmount(result.transaction.quantity, after.unit)} of ${after.name}. Remaining: ${formatAmount(after.quantity, after.unit)} (${STOCK_LABEL[after.stockStatus]}${after.stockStatus === 'in_stock' ? '' : ' — tell the lab manager to reorder'}).`,
        );
      } catch (err) {
        if (err.fields && Object.keys(err.fields).length) {
          const { first, unplaced } = showFieldErrors(usageForm, err.fields);
          if (unplaced.length) showBanner('crit', unplaced.join(' '));
          first?.focus();
        } else {
          showBanner('crit', err.message);
          usageForm.closest('dialog').close();
        }
      } finally {
        submit.disabled = false;
      }
    });

    // ---- Stock adjustment dialog (managers) ----
    const adjustForm = root.querySelector('#adjust-form');
    if (adjustForm) {
      const label = adjustForm.querySelector('#adjust-qty-label');
      const noteReq = adjustForm.querySelector('#adjust-note-req');
      const syncType = () => {
        const correction = adjustForm.type.value === 'correction';
        setHtml(label, html`${correction ? 'Counted quantity' : 'Amount received'} <span class="req">(required)</span>`);
        noteReq.textContent = correction ? '(required for corrections)' : '(optional for restock)';
      };
      adjustForm.addEventListener('change', (e) => e.target.name === 'type' && syncType());
      adjustForm.addEventListener('reset', () => setTimeout(syncType));
      adjustForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(adjustForm);
        const body = { type: adjustForm.type.value, quantity: adjustForm.quantity.value, note: adjustForm.note.value };
        const { errors } = validateAdjustment(body, m);
        if (Object.keys(errors).length) {
          showFieldErrors(adjustForm, errors).first?.focus();
          return;
        }
        try {
          const result = await api(`/materials/${m.id}/adjustments`, { method: 'POST', body });
          adjustForm.closest('dialog').close();
          await refresh('log-usage-btn');
          const t = result.transaction;
          showBanner('ok', `Stock ${t.type === 'restock' ? 'restocked' : 'corrected'}: ${formatAmount(t.quantityBefore, t.unit)} → ${formatAmount(t.quantityAfter, t.unit)}.`);
        } catch (err) {
          if (err.fields && Object.keys(err.fields).length) showFieldErrors(adjustForm, err.fields).first?.focus();
          else {
            adjustForm.closest('dialog').close();
            showBanner('crit', err.message);
          }
        }
      });
    }

    // ---- Archive dialog (managers) ----
    root.querySelector('#archive-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(`/materials/${m.id}`, { method: 'DELETE' });
        e.target.closest('dialog').close();
        setFlash('ok', `${m.name} (ID ${m.id}) was archived. Its usage history is kept.`);
        go('#/inventory');
      } catch (err) {
        e.target.closest('dialog').close();
        showBanner('crit', err.message);
      }
    });
  }

  const historyLoaded = draw(material);

  // R7: stop the clock as soon as the material record is on screen (history loads separately).
  const timing = takeTiming();
  if (timing) {
    root.querySelector('#timing').textContent = `Retrieved in ${timing.ms} ms (${timing.source} → record displayed). Target: 3 seconds or less (R7).`;
  }
  await historyLoaded;
}
