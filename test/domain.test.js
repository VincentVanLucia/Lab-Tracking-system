import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockStatus, expiryStatus, parseIsoDate, daysBetween, round3 } from '../server/domain/status.js';
import { parseAmount, normalizeMaterialId, validateMaterial, validateUsage, validateAdjustment } from '../server/domain/validation.js';

const TODAY = '2026-11-25';

test('stockStatus: thresholds are inclusive ("reach or fall below")', () => {
  assert.equal(stockStatus(15, 20, 10), 'low_stock', '§6.1.3 example: 15 mL ≤ 20 mL is low stock');
  assert.equal(stockStatus(20, 20, 10), 'low_stock');
  assert.equal(stockStatus(20.001, 20, 10), 'in_stock');
  assert.equal(stockStatus(10, 20, 10), 'critical');
  assert.equal(stockStatus(0, 20, 0), 'critical');
});

test('expiryStatus: days remaining = expiration − today, warning when ≤ threshold', () => {
  assert.deepEqual(expiryStatus('2026-12-13', 30, TODAY), { status: 'expiring_soon', daysLeft: 18 }, '§6.1.3 example: 18 ≤ 30');
  assert.equal(expiryStatus('2026-12-25', 30, TODAY).status, 'expiring_soon');
  assert.equal(expiryStatus('2026-12-26', 30, TODAY).status, 'valid');
  assert.equal(expiryStatus(TODAY, 30, TODAY).status, 'expiring_soon');
  assert.equal(expiryStatus('2026-11-24', 30, TODAY).status, 'expired');
  assert.equal(expiryStatus('2027-01-09', 60, TODAY).status, 'expiring_soon', 'per-material threshold');
  assert.equal(expiryStatus('2027-01-09', 14, TODAY).status, 'valid');
});

test('dates: strict calendar validation and DST-safe day differences', () => {
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('2026-2-3'), null);
  assert.equal(parseIsoDate('not a date'), null);
  assert.ok(parseIsoDate('2028-02-29'));
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
});

test('parseAmount: accepts dot or comma decimals, rejects junk and >3 decimals', () => {
  assert.deepEqual(parseAmount('12.5'), { value: 12.5 });
  assert.deepEqual(parseAmount('12,5'), { value: 12.5 });
  assert.deepEqual(parseAmount(' 7 '), { value: 7 });
  assert.deepEqual(parseAmount(0.001), { value: 0.001 });
  assert.deepEqual(parseAmount(''), { error: 'required' });
  assert.deepEqual(parseAmount(null), { error: 'required' });
  assert.deepEqual(parseAmount('abc'), { error: 'not_a_number' });
  assert.deepEqual(parseAmount('1e3'), { error: 'not_a_number' });
  assert.deepEqual(parseAmount('12,5,3'), { error: 'not_a_number' });
  assert.deepEqual(parseAmount(Infinity), { error: 'not_a_number' });
  assert.deepEqual(parseAmount('1.2345'), { error: 'precision' });
  assert.equal(round3(0.1 + 0.2), 0.3);
});

test('normalizeMaterialId: printed ID or QR payload', () => {
  assert.equal(normalizeMaterialId('0007'), '0007');
  assert.equal(normalizeMaterialId('LAB-0007'), '0007');
  assert.equal(normalizeMaterialId('lab:0042'), '0042');
  assert.equal(normalizeMaterialId('007'), null);
  assert.equal(normalizeMaterialId('12345'), null);
});

const valid = {
  name: 'Taq', category: 'Enzyme', unit: 'µL', initialQuantity: '500', lowStockThreshold: '100',
  criticalStockThreshold: '50', openingDate: '2026-11-01', expirationDate: '2027-06-01', storageCondition: 'frozen_20',
};

test('validateMaterial: valid form passes and defaults the 30-day warning', () => {
  const { value, errors } = validateMaterial(valid, { mode: 'create', today: TODAY });
  assert.deepEqual(errors, {});
  assert.equal(value.expiryWarningDays, 30);
  assert.equal(value.id, null, 'blank ID is auto-assigned');
});

test('validateMaterial: every mandatory field is enforced with a fix-it message', () => {
  const { errors } = validateMaterial({}, { mode: 'create', today: TODAY });
  for (const f of ['name', 'category', 'unit', 'initialQuantity', 'lowStockThreshold', 'criticalStockThreshold', 'openingDate', 'expirationDate', 'storageCondition']) {
    assert.ok(errors[f], `${f} required`);
  }
});

test('validateMaterial: cross-field rules', () => {
  const check = (patch) => validateMaterial({ ...valid, ...patch }, { mode: 'create', today: TODAY }).errors;
  assert.match(check({ criticalStockThreshold: '150' }).criticalStockThreshold, /less than or equal to the low-stock threshold/);
  assert.match(check({ openingDate: '2026-12-01' }).openingDate, /cannot be in the future/);
  assert.match(check({ expirationDate: '2026-10-01' }).expirationDate, /on or after the opening date/);
  assert.match(check({ id: '12' }).id, /exactly 4 digits/);
  assert.match(check({ initialQuantity: '0' }).initialQuantity, /greater than 0/);
  assert.match(check({ expiryWarningDays: '-3' }).expiryWarningDays, /whole number/);
  assert.deepEqual(validateMaterial({ ...valid, initialQuantity: undefined }, { mode: 'update', today: TODAY }).errors, {});
});

test('validateUsage: blocks over-stock, zero, negative and non-numeric amounts', () => {
  const m = { quantity: 65, unit: 'mL' };
  assert.deepEqual(validateUsage({ quantity: '12' }, m).errors, {});
  assert.deepEqual(validateUsage({ quantity: 65 }, m).errors, {}, 'using exactly the remaining stock is allowed');
  assert.match(validateUsage({ quantity: 65.001 }, m).errors.quantity, /Only 65 mL is available/);
  assert.match(validateUsage({ quantity: 0 }, m).errors.quantity, /greater than 0/);
  assert.match(validateUsage({ quantity: -2 }, m).errors.quantity, /greater than 0/);
  assert.match(validateUsage({ quantity: 'x' }, m).errors.quantity, /as a number/);
});

test('validateAdjustment: restock adds, correction needs a reason', () => {
  const m = { quantity: 10, unit: 'g' };
  assert.deepEqual(validateAdjustment({ type: 'restock', quantity: '5' }, m).errors, {});
  assert.ok(validateAdjustment({ type: 'correction', quantity: '8' }, m).errors.note);
  assert.deepEqual(validateAdjustment({ type: 'correction', quantity: '0', note: 'Count' }, m).errors, {});
  assert.ok(validateAdjustment({ type: 'restock', quantity: '0' }, m).errors.quantity);
  assert.ok(validateAdjustment({ type: 'other', quantity: '1' }, m).errors.type);
});
