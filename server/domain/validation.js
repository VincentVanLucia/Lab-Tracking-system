// Input validation for the material registration form (F1, R6, R8) and the
// usage transaction dialog (F4, R2, R8). Every rejection carries a field-level
// message that explains how to fix the input (WCAG 2.2 SC 3.3.1 / 3.3.3).

import { CATEGORIES, UNITS, STORAGE_VALUES } from './options.js';
import { DEFAULT_EXPIRY_WARNING_DAYS, parseIsoDate, round3 } from './status.js';

export const MATERIAL_ID_PATTERN = /^\d{4}$/;
const MAX_QUANTITY = 1_000_000_000;

/**
 * Accepts the printed ID ("0007") or the QR payload form ("LAB-0007") and returns the
 * canonical 4-digit ID, or null.
 */
export function normalizeMaterialId(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase().replace(/^LAB[-:\s]?/, '');
  return MATERIAL_ID_PATTERN.test(s) ? s : null;
}

/**
 * Parses a user-entered amount. Accepts numbers, or strings using "." or "," as the
 * decimal separator (Turkish locale keyboards produce ","). Returns { value } or { error }.
 * Error kinds: 'required' | 'not_a_number' | 'precision'.
 */
export function parseAmount(raw) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { error: 'required' };
  }
  let n;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string') {
    const s = raw.trim().replace(',', '.');
    if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return { error: 'not_a_number' };
    n = Number(s);
  } else {
    return { error: 'not_a_number' };
  }
  if (!Number.isFinite(n)) return { error: 'not_a_number' };
  if (Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) return { error: 'precision' };
  return { value: round3(n) };
}

export function formatAmount(value, unit) {
  const n = Number.isInteger(value) ? String(value) : String(round3(value));
  return unit ? `${n} ${unit}` : n;
}

function amountMessage(kind, { label, example = '12.5' }) {
  if (kind === 'required') return `Enter the ${label}.`;
  if (kind === 'not_a_number') return `Enter the ${label} as a number, for example ${example}.`;
  return `Use at most 3 decimal places for the ${label}.`;
}

function optionalText(body, key, max, errors, label) {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    errors[key] = `${label} must be text.`;
    return null;
  }
  const s = v.trim();
  if (s.length > max) errors[key] = `${label} must be ${max} characters or fewer (currently ${s.length}).`;
  return s === '' ? null : s;
}

/**
 * Validates the material registration / edit form.
 * mode 'create' also validates `id` (optional: auto-assigned when blank) and `initialQuantity`.
 * Returns { value, errors } where errors is a { field: message } map (empty when valid).
 */
export function validateMaterial(body, { mode = 'create', today }) {
  const errors = {};
  const value = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { value, errors: { form: 'Send the material as a JSON object.' } };
  }

  if (mode === 'create') {
    const rawId = typeof body.id === 'string' ? body.id.trim() : body.id;
    if (rawId === undefined || rawId === null || rawId === '') {
      value.id = null; // assigned by the server
    } else {
      const id = normalizeMaterialId(String(rawId));
      if (!id || id === '0000') errors.id = 'The ID must be exactly 4 digits between 0001 and 9999, for example 0012.';
      else value.id = id;
    }
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) errors.name = 'Enter the material name, for example "Taq DNA Polymerase".';
  else if (name.length > 120) errors.name = `The name must be 120 characters or fewer (currently ${name.length}).`;
  value.name = name;

  if (!CATEGORIES.includes(body.category)) errors.category = 'Choose a category.';
  value.category = body.category;

  if (!UNITS.includes(body.unit)) errors.unit = 'Choose the unit the quantity is measured in.';
  value.unit = body.unit;
  const unitLabel = UNITS.includes(body.unit) ? ` (${body.unit})` : '';

  if (mode === 'create') {
    const q = parseAmount(body.initialQuantity);
    if (q.error) errors.initialQuantity = amountMessage(q.error, { label: `quantity${unitLabel}`, example: '100' });
    else if (q.value <= 0) errors.initialQuantity = 'The quantity must be greater than 0.';
    else if (q.value > MAX_QUANTITY) errors.initialQuantity = 'The quantity is too large.';
    else value.initialQuantity = q.value;
  }

  const low = parseAmount(body.lowStockThreshold);
  if (low.error) errors.lowStockThreshold = amountMessage(low.error, { label: `low-stock threshold${unitLabel}`, example: '20' });
  else if (low.value < 0) errors.lowStockThreshold = 'The low-stock threshold cannot be negative.';
  else value.lowStockThreshold = low.value;

  const crit = parseAmount(body.criticalStockThreshold);
  if (crit.error) errors.criticalStockThreshold = amountMessage(crit.error, { label: `critical threshold${unitLabel}`, example: '5' });
  else if (crit.value < 0) errors.criticalStockThreshold = 'The critical threshold cannot be negative.';
  else if (value.lowStockThreshold !== undefined && crit.value > value.lowStockThreshold) {
    errors.criticalStockThreshold = `The critical threshold must be less than or equal to the low-stock threshold (${formatAmount(value.lowStockThreshold, body.unit)}).`;
  } else value.criticalStockThreshold = crit.value;

  const rawDays = body.expiryWarningDays;
  if (rawDays === undefined || rawDays === null || rawDays === '') {
    value.expiryWarningDays = DEFAULT_EXPIRY_WARNING_DAYS;
  } else {
    const n = typeof rawDays === 'number' ? rawDays : /^\s*\d+\s*$/.test(String(rawDays)) ? Number(rawDays) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 3650) errors.expiryWarningDays = 'Enter a whole number of days between 0 and 3650 (default 30).';
    else value.expiryWarningDays = n;
  }

  const openingOk = parseIsoDate(body.openingDate) !== null;
  if (!openingOk) errors.openingDate = 'Enter the opening date as a valid date (YYYY-MM-DD).';
  else if (today && body.openingDate > today) errors.openingDate = 'The opening date cannot be in the future.';
  value.openingDate = body.openingDate;

  if (parseIsoDate(body.expirationDate) === null) errors.expirationDate = 'Enter the expiration date as a valid date (YYYY-MM-DD).';
  else if (openingOk && body.expirationDate < body.openingDate) errors.expirationDate = 'The expiration date must be on or after the opening date.';
  value.expirationDate = body.expirationDate;

  if (!STORAGE_VALUES.includes(body.storageCondition)) errors.storageCondition = 'Choose the storage condition.';
  value.storageCondition = body.storageCondition;

  value.storageLocation = optionalText(body, 'storageLocation', 120, errors, 'Storage location');
  value.lotNumber = optionalText(body, 'lotNumber', 60, errors, 'Lot number');
  value.supplier = optionalText(body, 'supplier', 120, errors, 'Supplier');
  value.notes = optionalText(body, 'notes', 1000, errors, 'Notes');

  return { value, errors };
}

/**
 * Validates a usage transaction against the material's current stock (R8):
 * rejects missing, non-numeric, zero/negative, over-precise, and over-stock amounts.
 */
export function validateUsage(body, material) {
  const errors = {};
  const value = {};
  const unit = material.unit;
  const q = parseAmount(body?.quantity);
  if (q.error) {
    errors.quantity = amountMessage(q.error, { label: `amount used (${unit})` });
  } else if (q.value <= 0) {
    errors.quantity = 'The amount used must be greater than 0.';
  } else if (q.value > material.quantity) {
    errors.quantity = `Only ${formatAmount(material.quantity, unit)} is available. Enter ${formatAmount(material.quantity, unit)} or less, or ask a lab manager to correct the stock count.`;
  } else {
    value.quantity = q.value;
  }
  value.note = optionalText(body ?? {}, 'note', 500, errors, 'Note');
  return { value, errors };
}

/** Stock adjustments by managers: restock adds an amount, correction sets the counted amount. */
export function validateAdjustment(body, material) {
  const errors = {};
  const value = {};
  const unit = material.unit;
  if (body?.type !== 'restock' && body?.type !== 'correction') {
    errors.type = 'Choose "Restock" or "Stock count correction".';
  }
  value.type = body?.type;
  const q = parseAmount(body?.quantity);
  const label = value.type === 'correction' ? `counted quantity (${unit})` : `amount received (${unit})`;
  if (q.error) errors.quantity = amountMessage(q.error, { label, example: '50' });
  else if (value.type === 'restock' && q.value <= 0) errors.quantity = 'The amount received must be greater than 0.';
  else if (value.type === 'correction' && q.value < 0) errors.quantity = 'The counted quantity cannot be negative.';
  else if (q.value > MAX_QUANTITY) errors.quantity = 'The quantity is too large.';
  else value.quantity = q.value;
  value.note = optionalText(body ?? {}, 'note', 500, errors, 'Note');
  if (value.type === 'correction' && !value.note && !errors.note) {
    errors.note = 'Describe why the stock count is being corrected, for example "Monthly physical count".';
  }
  return { value, errors };
}
