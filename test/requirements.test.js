// Automated verification of the Section 1 requirements (R1–R12), following each
// requirement's stated verification method as closely as an automated test allows.
// R9's WCAG contrast/labelling checks are in contrast.test.js and frontend.test.js; the SUS
// usability session and on-device timing (R7) remain manual — see docs/verification.md.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, decodeQrSvg, day } from './helpers.js';
import { parseMaterialId } from '../public/js/status-text.js';

// Ten sample materials (R1, R6). Expiry offsets exercise the 30-day default threshold and
// per-material thresholds (R3).
const SAMPLES = [
  { key: 'S1', name: 'Lysozyme Solution (10 mg/mL)', category: 'Enzyme', unit: 'mL', initialQuantity: 100, lowStockThreshold: 20, criticalStockThreshold: 10, exp: 150, storageCondition: 'refrigerated', expect: 'valid' },
  { key: 'S2', name: 'Taq DNA Polymerase', category: 'Enzyme', unit: 'µL', initialQuantity: 500, lowStockThreshold: 100, criticalStockThreshold: 50, exp: 240, storageCondition: 'frozen_20', expect: 'valid' },
  { key: 'S3', name: 'EcoRI-HF Restriction Enzyme', category: 'Enzyme', unit: 'µL', initialQuantity: 200, lowStockThreshold: 100, criticalStockThreshold: 40, exp: 18, storageCondition: 'frozen_20', expect: 'expiring_soon' },
  { key: 'S4', name: 'Ethanol Absolute', category: 'Chemical', unit: 'mL', initialQuantity: 2500, lowStockThreshold: 500, criticalStockThreshold: 250, exp: 30, storageCondition: 'room_temp', expect: 'expiring_soon' },
  { key: 'S5', name: 'Agarose', category: 'Chemical', unit: 'g', initialQuantity: 500, lowStockThreshold: 100, criticalStockThreshold: 50, exp: 31, storageCondition: 'room_temp', expect: 'valid' },
  { key: 'S6', name: 'Tris Base', category: 'Chemical', unit: 'g', initialQuantity: 500, lowStockThreshold: 100, criticalStockThreshold: 50, exp: 0, storageCondition: 'room_temp', expect: 'expiring_soon' },
  { key: 'S7', name: 'Plasmid Miniprep Kit', category: 'Kit', unit: 'preps', initialQuantity: 50, lowStockThreshold: 10, criticalStockThreshold: 5, exp: -1, storageCondition: 'room_temp', expect: 'expired' },
  { key: 'S8', name: 'dNTP Mix (10 mM)', category: 'Chemical', unit: 'µL', initialQuantity: 1000, lowStockThreshold: 200, criticalStockThreshold: 100, exp: 45, expiryWarningDays: 60, storageCondition: 'frozen_20', expect: 'expiring_soon' },
  { key: 'S9', name: 'Fetal Bovine Serum', category: 'Protein', unit: 'mL', initialQuantity: 500, lowStockThreshold: 20, criticalStockThreshold: 10, exp: 45, expiryWarningDays: 14, storageCondition: 'frozen_20', expect: 'valid' },
  { key: 'S10', name: 'Anti-GAPDH Antibody', category: 'Protein', unit: 'µL', initialQuantity: 100, lowStockThreshold: 20, criticalStockThreshold: 10, exp: 330, storageCondition: 'refrigerated', expect: 'valid' },
];

// Twenty simulated usage transactions (R2, R5). S1 reproduces the §6.1.2 worked example.
const USES = [
  ['S1', 12], ['S1', 8], ['S1', 15],
  ['S2', 25], ['S2', 75],
  ['S3', 40], ['S3', 30], ['S3', 50],
  ['S4', 200.5], ['S4', 349.5],
  ['S5', 0.125], ['S5', 0.375],
  ['S6', 120], ['S6', 150], ['S6', 190],
  ['S7', 12], ['S7', 10],
  ['S8', 0.001],
  ['S10', 5], ['S10', 10],
];

const EXPECTED_STOCK = { S1: 'in_stock', S2: 'in_stock', S3: 'low_stock', S4: 'in_stock', S5: 'in_stock', S6: 'critical', S7: 'in_stock', S8: 'in_stock', S9: 'in_stock', S10: 'in_stock' };

function formBody(s) {
  return {
    name: s.name,
    category: s.category,
    unit: s.unit,
    initialQuantity: String(s.initialQuantity),
    lowStockThreshold: String(s.lowStockThreshold),
    criticalStockThreshold: String(s.criticalStockThreshold),
    expiryWarningDays: s.expiryWarningDays === undefined ? '' : String(s.expiryWarningDays),
    openingDate: day(-10),
    expirationDate: day(s.exp),
    storageCondition: s.storageCondition,
    storageLocation: `Shelf ${s.key}`,
  };
}

describe('Section 1 requirements (R1–R3, R5–R8, R10–R12)', () => {
  let srv;
  let manager;
  let member;
  let viewer;
  const ids = {}; // sample key -> material ID

  before(async () => {
    srv = await startServer();
    manager = await srv.login('manager');
    member = await srv.login('member');
    viewer = await srv.login('viewer');
  });
  after(() => srv.close());

  test('R6 — 10 materials submitted through the registration form store and display all mandatory fields', async () => {
    for (const s of SAMPLES) {
      const r = await srv.request('/api/materials', { method: 'POST', token: manager, body: formBody(s) });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      ids[s.key] = r.body.material.id;
    }
    assert.equal(new Set(Object.values(ids)).size, 10, 'each material gets a unique ID');

    const rows = srv.db.prepare('SELECT * FROM materials').all();
    assert.equal(rows.length, 10);
    for (const s of SAMPLES) {
      const row = rows.find((r) => r.code === ids[s.key]);
      for (const col of ['name', 'code', 'opening_date', 'expiration_date', 'storage_condition', 'quantity']) {
        assert.ok(row[col] !== null && row[col] !== '', `${s.key}: ${col} stored`);
      }
      const shown = (await srv.request(`/api/materials/${ids[s.key]}`, { token: viewer })).body.material;
      assert.equal(shown.name, s.name);
      assert.equal(shown.id, ids[s.key]);
      assert.equal(shown.openingDate, day(-10));
      assert.equal(shown.expirationDate, day(s.exp));
      assert.ok(shown.storageConditionLabel.length > 0);
      assert.equal(shown.quantity, s.initialQuantity);
    }
  });

  test('R1 — every printed QR label decodes to the correct material record (10/10)', async () => {
    for (const s of SAMPLES) {
      const { labels } = (await srv.request(`/api/labels?ids=${ids[s.key]}`, { token: member })).body;
      assert.equal(labels.length, 1);
      const decoded = decodeQrSvg(labels[0].svg);
      assert.equal(decoded, `LAB-${ids[s.key]}`, `${s.key} QR payload`);
      const id = parseMaterialId(decoded); // same parser the browser scanner uses
      const record = (await srv.request(`/api/materials/${id}`, { token: member })).body.material;
      assert.equal(record.name, s.name);
      assert.equal(record.id, ids[s.key]);
    }
  });

  test('R3 — expiration warnings are classified correctly (30-day default, adjustable per material)', async () => {
    for (const s of SAMPLES) {
      const m = (await srv.request(`/api/materials/${ids[s.key]}`, { token: viewer })).body.material;
      assert.equal(m.expiryStatus, s.expect, `${s.key}: ${s.exp} days left, warning ${s.expiryWarningDays ?? 30} days`);
      assert.equal(m.daysUntilExpiry, s.exp);
    }
  });

  test('R2 + R5 — 20 usage transactions: quantities match manual calculation and every record is complete', async () => {
    const expected = Object.fromEntries(SAMPLES.map((s) => [s.key, s.initialQuantity]));
    const before = Date.now();
    for (const [key, amount] of USES) {
      const r = await srv.request('/api/usage', {
        method: 'POST',
        token: member,
        body: { materialId: ids[key], quantity: amount, confirmExpired: key === 'S7' ? true : undefined },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      expected[key] = Math.round((expected[key] - amount) * 1000) / 1000;
      assert.equal(r.body.transaction.quantityAfter, expected[key], `${key} after using ${amount}`);
      assert.equal(r.body.material.quantity, expected[key]);
    }
    assert.equal(expected.S1, 65, '§6.1.2 example: 100 − (12 + 8 + 15) = 65 mL');
    for (const s of SAMPLES) {
      const m = (await srv.request(`/api/materials/${ids[s.key]}`, { token: viewer })).body.material;
      assert.equal(m.quantity, expected[s.key], `${s.key} final quantity`);
    }

    const history = (await srv.request('/api/usage?type=usage&limit=200', { token: viewer })).body;
    assert.equal(history.total, 20);
    for (const t of history.items) {
      assert.match(t.materialId, /^\d{4}$/);
      assert.equal(t.user.username, 'member');
      assert.ok(Date.parse(t.createdAt) >= before - 1000, 'date/time recorded');
      assert.ok(t.quantity > 0, 'quantity used recorded');
    }
  });

  test('R8 — 10 deliberately invalid usage submissions are rejected without changing the database', async () => {
    const id = ids.S1; // 65 mL available
    const invalid = [65.001, 66, 1e9, 0, -1, -0.5, 'abc', '12,5,3', '', '1.2345'];
    const countTx = () => srv.db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;
    const txBefore = countTx();
    for (const quantity of invalid) {
      const r = await srv.request('/api/usage', { method: 'POST', token: member, body: { materialId: id, quantity } });
      assert.equal(r.status, 422, `quantity ${JSON.stringify(quantity)} must be rejected`);
      assert.ok(r.body.error.fields.quantity.length > 10, 'inline error explains how to fix the input');
    }
    assert.equal(countTx(), txBefore, 'no transaction written');
    assert.equal(srv.db.prepare('SELECT quantity FROM materials WHERE code = ?').get(id).quantity, 65, 'stock unchanged');

    const over = await srv.request('/api/usage', { method: 'POST', token: member, body: { materialId: id, quantity: 70 } });
    assert.match(over.body.error.fields.quantity, /Only 65 mL is available/);
    const expired = await srv.request('/api/usage', { method: 'POST', token: member, body: { materialId: ids.S7, quantity: 1 } });
    assert.equal(expired.status, 422, 'expired material requires explicit suitability confirmation');
    assert.ok(expired.body.error.fields.confirmExpired);
  });

  test('R7 — material retrieval by ID and by search responds within 3 seconds (server side)', async () => {
    for (const s of SAMPLES) {
      let t = performance.now();
      const byId = await srv.request(`/api/materials/${ids[s.key]}`, { token: viewer });
      assert.equal(byId.status, 200);
      assert.ok(performance.now() - t < 3000);
      t = performance.now();
      const bySearch = await srv.request(`/api/materials?q=${encodeURIComponent(s.name)}`, { token: viewer });
      assert.equal(bySearch.status, 200);
      assert.ok(performance.now() - t < 3000);
    }
  });

  test('R10 — each of the 10 materials can be found in the searchable table by name and by printed ID', async () => {
    for (const s of SAMPLES) {
      const byName = (await srv.request(`/api/materials?q=${encodeURIComponent(s.name.slice(0, 8))}`, { token: viewer })).body.items;
      assert.ok(byName.some((m) => m.id === ids[s.key]), `${s.key} by name`);
      const byId = (await srv.request(`/api/materials?q=${ids[s.key]}`, { token: viewer })).body.items;
      assert.equal(byId[0]?.id, ids[s.key], `${s.key} by printed ID`);
      const byPayload = (await srv.request(`/api/materials?q=LAB-${ids[s.key]}`, { token: viewer })).body.items;
      assert.ok(byPayload.some((m) => m.id === ids[s.key]), `${s.key} by QR payload text`);
    }
    const lower = (await srv.request('/api/materials?q=taq', { token: viewer })).body.items;
    assert.equal(lower[0]?.id, ids.S2, 'search is case-insensitive');
  });

  test('R11 — 10 unauthorized modification attempts are rejected and logged', async () => {
    const target = ids.S2;
    const body = formBody(SAMPLES[1]);
    const attempts = [
      { token: undefined, method: 'POST', path: '/api/materials', body },
      { token: undefined, method: 'PUT', path: `/api/materials/${target}`, body },
      { token: undefined, method: 'DELETE', path: `/api/materials/${target}` },
      { token: viewer, method: 'POST', path: '/api/materials', body },
      { token: viewer, method: 'PUT', path: `/api/materials/${target}`, body },
      { token: viewer, method: 'DELETE', path: `/api/materials/${target}` },
      { token: viewer, method: 'POST', path: '/api/usage', body: { materialId: target, quantity: 1 } },
      { token: member, method: 'POST', path: '/api/materials', body },
      { token: member, method: 'DELETE', path: `/api/materials/${target}` },
      { token: member, method: 'POST', path: `/api/materials/${target}/adjustments`, body: { type: 'restock', quantity: 10 } },
    ];
    const deniedBefore = srv.db.prepare("SELECT COUNT(*) AS n FROM access_log WHERE outcome = 'denied'").get().n;
    const snapshot = JSON.stringify(srv.db.prepare('SELECT * FROM materials ORDER BY id').all());
    for (const a of attempts) {
      const r = await srv.request(a.path, { method: a.method, token: a.token, body: a.body });
      assert.equal(r.status, a.token ? 403 : 401, `${a.method} ${a.path}`);
    }
    const deniedAfter = srv.db.prepare("SELECT COUNT(*) AS n FROM access_log WHERE outcome = 'denied'").get().n;
    assert.equal(deniedAfter - deniedBefore, 10, 'every rejection is logged');
    assert.equal(JSON.stringify(srv.db.prepare('SELECT * FROM materials ORDER BY id').all()), snapshot, 'no data changed');

    const log = (await srv.request('/api/audit?outcome=denied', { token: manager })).body;
    assert.ok(log.items.some((e) => e.username === 'viewer' && e.action === 'materials.delete'));
    assert.ok(log.items.some((e) => e.username === null && e.action === 'materials.create'));
    assert.equal((await srv.request('/api/audit', { token: member })).status, 403, 'only managers read the access log');
  });

  test('R12 — dashboard stock/expiry status matches the database and shows all 20 usage transactions', async () => {
    const dash = (await srv.request('/api/dashboard', { token: viewer })).body;
    const list = (await srv.request('/api/materials', { token: viewer })).body.items;
    assert.equal(dash.totals.materials, 10);
    for (const s of SAMPLES) {
      const m = list.find((x) => x.id === ids[s.key]);
      assert.equal(m.stockStatus, EXPECTED_STOCK[s.key], `${s.key} stock status`);
      assert.equal(m.expiryStatus, s.expect, `${s.key} expiry status`);
    }
    const count = (field, value) => list.filter((m) => m[field] === value).length;
    assert.deepEqual(dash.totals.stock, { in_stock: count('stockStatus', 'in_stock'), low_stock: count('stockStatus', 'low_stock'), critical: count('stockStatus', 'critical') });
    assert.deepEqual(dash.totals.stock, { in_stock: 8, low_stock: 1, critical: 1 });
    assert.deepEqual(dash.totals.expiry, { valid: 5, expiring_soon: 4, expired: 1 });
    assert.deepEqual(dash.attention.map((m) => m.id).sort(), list.filter((m) => m.needsAttention).map((m) => m.id).sort());

    let seen = 0;
    for (let offset = 0; ; offset += 8) {
      const page = (await srv.request(`/api/usage?type=usage&limit=8&offset=${offset}`, { token: viewer })).body;
      seen += page.items.length;
      if (page.items.length < 8) break;
    }
    assert.equal(seen, 20, 'all 20 simulated transactions visible in the usage history');
  });
});

describe('R4 — stock-status classification across 20 test quantities (above / at / below thresholds)', () => {
  let srv;
  let manager;
  let id;
  before(async () => {
    srv = await startServer();
    manager = await srv.login('manager');
    const r = await srv.request('/api/materials', {
      method: 'POST',
      token: manager,
      body: { name: 'Threshold test buffer', category: 'Chemical', unit: 'mL', initialQuantity: '100', lowStockThreshold: '20', criticalStockThreshold: '10', openingDate: day(-1), expirationDate: day(300), storageCondition: 'room_temp' },
    });
    id = r.body.material.id;
  });
  after(() => srv.close());

  // low = 20 mL, critical = 10 mL
  const CASES = [
    [100, 'in_stock'], [50, 'in_stock'], [21, 'in_stock'], [20.5, 'in_stock'], [20.001, 'in_stock'],
    [20, 'low_stock'], [19.999, 'low_stock'], [15, 'low_stock'], [12, 'low_stock'], [10.001, 'low_stock'],
    [10, 'critical'], [9.999, 'critical'], [5, 'critical'], [0.001, 'critical'], [0, 'critical'],
    [35, 'in_stock'], [20, 'low_stock'], [10, 'critical'], [10.5, 'low_stock'], [1000, 'in_stock'],
  ];

  test('page, searchable table and dashboard agree for each of the 20 cases', async () => {
    assert.equal(CASES.length, 20);
    for (const [quantity, expected] of CASES) {
      const adj = await srv.request(`/api/materials/${id}/adjustments`, {
        method: 'POST',
        token: manager,
        body: { type: 'correction', quantity, note: 'R4 threshold test' },
      });
      assert.equal(adj.status, 201, JSON.stringify(adj.body));
      const page = (await srv.request(`/api/materials/${id}`, { token: manager })).body.material;
      const table = (await srv.request(`/api/materials?q=${id}`, { token: manager })).body.items[0];
      const filtered = (await srv.request(`/api/materials?status=${expected}`, { token: manager })).body.items;
      const dash = (await srv.request('/api/dashboard', { token: manager })).body;
      assert.equal(page.stockStatus, expected, `material page at ${quantity} mL`);
      assert.equal(table.stockStatus, expected, `inventory table at ${quantity} mL`);
      assert.ok(filtered.some((m) => m.id === id), `status filter "${expected}" at ${quantity} mL`);
      assert.equal(dash.totals.stock[expected], 1, `dashboard count at ${quantity} mL`);
      assert.equal(dash.attention.some((m) => m.id === id), expected !== 'in_stock', `dashboard attention list at ${quantity} mL`);
    }
  });
});
