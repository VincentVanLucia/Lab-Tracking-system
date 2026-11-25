// R9 / WCAG 2.2 SC 1.4.1: every status indicator pairs colour with text and a distinct icon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TONE, STOCK_LABEL, expiryLabel, parseMaterialId, formatAmount } from '../public/js/status-text.js';
import { badge } from '../public/js/ui.js';

test('every stock and expiry status has a text label and a tone', () => {
  for (const s of ['in_stock', 'low_stock', 'critical']) {
    assert.ok(TONE[s]);
    assert.ok(STOCK_LABEL[s].length > 0);
  }
  assert.deepEqual([STOCK_LABEL.in_stock, STOCK_LABEL.low_stock, STOCK_LABEL.critical], ['In Stock', 'Low Stock', 'Critical']);
  assert.equal(expiryLabel('expiring_soon', 18), 'Expires in 18 days');
  assert.equal(expiryLabel('expiring_soon', 0), 'Expires today');
  assert.equal(expiryLabel('expired', -3), 'Expired 3 days ago');
  assert.match(expiryLabel('valid', 200), /200 days left/);
});

test('green / yellow / red badges render text plus three different icon shapes', () => {
  const rendered = ['ok', 'warn', 'crit'].map((tone) => String(badge(tone, `Label ${tone}`)));
  rendered.forEach((markup, i) => {
    assert.match(markup, new RegExp(`Label ${['ok', 'warn', 'crit'][i]}`), 'visible text label');
    assert.match(markup, /<svg[^>]*aria-hidden="true"/, 'decorative icon hidden from screen readers');
  });
  const shapes = rendered.map((m) => /<svg[^>]*>(.*)<\/svg>/.exec(m)[1]);
  assert.equal(new Set(shapes).size, 3, 'icons differ so status is readable without colour');
});

test('badge text is HTML-escaped', () => {
  assert.doesNotMatch(String(badge('ok', '<img src=x onerror=alert(1)>')), /<img/);
});

test('scanner payload parser accepts label formats and rejects foreign codes', () => {
  assert.equal(parseMaterialId('LAB-0007'), '0007');
  assert.equal(parseMaterialId('0007'), '0007');
  assert.equal(parseMaterialId('lab:0012'), '0012');
  assert.equal(parseMaterialId('https://lab.example/#/materials/0042'), '0042');
  assert.equal(parseMaterialId('https://example.com/promo'), null);
  assert.equal(parseMaterialId('0000'), null);
  assert.equal(parseMaterialId('12345'), null);
});

test('amounts are formatted with their unit', () => {
  assert.equal(formatAmount(1800, 'mL'), '1,800 mL');
  assert.equal(formatAmount(0.125, 'g'), '0.125 g');
});

test('touch targets: controls ≥ 24 px, primary bench buttons ≥ 44 px (SC 2.5.8)', () => {
  const css = fs.readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');
  const minHeight = (selector) => {
    const block = new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? '';
    return Number(/min-height:\s*(\d+)px/.exec(block)?.[1]);
  };
  assert.ok(minHeight('.btn') >= 44, '.btn');
  assert.ok(minHeight('.btn-lg') >= 44, '.btn-lg');
  assert.ok(minHeight('.btn-sm') >= 24, '.btn-sm');
  assert.ok(minHeight('.nav-link') >= 44, '.nav-link');
});
