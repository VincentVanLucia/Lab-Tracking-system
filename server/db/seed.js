// Demo data: 3 role-based accounts and 10 fictional laboratory materials (§5: "10 fictional
// laboratory material records") whose dates are relative to today, so the dashboard always
// shows a realistic mix of In Stock / Low Stock / Critical and Valid / Expiring / Expired.

import { hashPassword } from '../auth/passwords.js';
import { addDays } from '../domain/status.js';
import { nowIso, transaction } from './index.js';

export const DEMO_USERS = [
  { username: 'manager', password: 'manager123', displayName: 'Lab Manager', role: 'manager' },
  { username: 'member', password: 'member123', displayName: 'Bench Researcher', role: 'member' },
  { username: 'viewer', password: 'viewer123', displayName: 'Read-only Viewer', role: 'viewer' },
];

// opened / expires are day offsets from today; uses are consumption transactions.
const DEMO_MATERIALS = [
  { code: '0001', name: 'Taq DNA Polymerase (5 U/µL)', category: 'Enzyme', unit: 'µL', initial: 500, uses: [25, 25, 50], low: 100, critical: 50, opened: -40, expires: 240, storage: 'frozen_20', location: 'Freezer A, rack 2', lot: 'TQ-24117' },
  { code: '0002', name: 'EcoRI-HF Restriction Enzyme (20 U/µL)', category: 'Enzyme', unit: 'µL', initial: 200, uses: [40, 30, 50], low: 100, critical: 40, opened: -60, expires: 18, storage: 'frozen_20', location: 'Freezer A, rack 1', lot: 'ER-10442' },
  { code: '0003', name: 'Lysozyme Solution (10 mg/mL)', category: 'Enzyme', unit: 'mL', initial: 100, uses: [12, 8, 15], low: 20, critical: 10, opened: -10, expires: 150, storage: 'refrigerated', location: 'Fridge 1, shelf 3', lot: 'LZ-3381' },
  { code: '0004', name: 'Ethanol, Absolute (≥ 99.8%)', category: 'Chemical', unit: 'mL', initial: 2500, uses: [200, 350, 150], low: 500, critical: 250, opened: -90, expires: 600, storage: 'room_temp', location: 'Flammables cabinet', lot: 'ET-55102', notes: 'Flammable. Keep away from ignition sources.' },
  { code: '0005', name: 'Agarose, Molecular Biology Grade', category: 'Chemical', unit: 'g', initial: 500, uses: [30, 50], low: 100, critical: 50, opened: -120, expires: 700, storage: 'room_temp', location: 'Shelf B2', lot: 'AG-7720' },
  { code: '0006', name: 'Tris Base', category: 'Chemical', unit: 'g', initial: 500, uses: [120, 150, 190], low: 100, critical: 50, opened: -200, expires: 400, storage: 'room_temp', location: 'Shelf B3', lot: 'TR-1934' },
  { code: '0007', name: 'Plasmid Miniprep Kit (50 preps)', category: 'Kit', unit: 'preps', initial: 50, uses: [12, 10, 12, 8], low: 10, critical: 5, opened: -150, expires: 75, storage: 'room_temp', location: 'Kit cabinet, drawer 1', lot: 'PM-0921' },
  { code: '0008', name: 'dNTP Mix (10 mM each)', category: 'Chemical', unit: 'µL', initial: 1000, uses: [150, 250], low: 200, critical: 100, opened: -150, expires: -5, storage: 'frozen_20', location: 'Freezer A, rack 3', lot: 'DN-6650' },
  { code: '0009', name: 'Fetal Bovine Serum (FBS)', category: 'Protein', unit: 'mL', initial: 500, uses: [150, 200, 135], low: 20, critical: 10, opened: -45, expires: 25, storage: 'frozen_20', location: 'Freezer B, shelf 1', lot: 'FB-2205', notes: 'Thaw at 4 °C overnight. Avoid repeated freeze–thaw cycles.' },
  { code: '0010', name: 'Anti-GAPDH Antibody (mouse monoclonal)', category: 'Protein', unit: 'µL', initial: 100, uses: [5, 10], low: 20, critical: 10, opened: -20, expires: 330, storage: 'refrigerated', location: 'Fridge 2, antibody box', lot: 'AB-4471' },
];

export function createUser(db, { username, password, displayName, role }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (username, display_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(username, displayName, role, hashPassword(password), nowIso());
  return Number(lastInsertRowid);
}

export function seedUsers(db) {
  return Object.fromEntries(DEMO_USERS.map((u) => [u.role, createUser(db, u)]));
}

/** Local-time timestamp on a given calendar day, as UTC ISO. */
function at(isoDay, hour, minute = 0) {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
}

export function seedDemo(db, today) {
  transaction(db, () => {
    const ids = seedUsers(db);
    const people = [ids.member, ids.manager];
    const insertMaterial = db.prepare(`
      INSERT INTO materials (code, name, category, quantity, initial_quantity, unit, low_stock_threshold,
        critical_stock_threshold, expiry_warning_days, opening_date, expiration_date, storage_condition,
        storage_location, lot_number, supplier, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 30, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTx = db.prepare(`
      INSERT INTO transactions (material_id, user_id, type, quantity_change, quantity_before, quantity_after, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    DEMO_MATERIALS.forEach((m, index) => {
      const openingDate = addDays(today, m.opened);
      const registeredAt = at(openingDate, 9, 15);
      const quantity = m.uses.reduce((left, used) => left - used, m.initial);
      const span = Math.max(-m.opened - 1, 1);
      const { lastInsertRowid: materialId } = insertMaterial.run(
        m.code, m.name, m.category, quantity, m.initial, m.unit, m.low, m.critical, openingDate,
        addDays(today, m.expires), m.storage, m.location, m.lot, 'Demo Supplier', m.notes ?? null,
        ids.manager, registeredAt, registeredAt,
      );
      insertTx.run(materialId, ids.manager, 'registration', m.initial, 0, m.initial, 'Initial registration', registeredAt);

      let left = m.initial;
      let lastAt = registeredAt;
      m.uses.forEach((used, i) => {
        const day = addDays(openingDate, Math.round(((i + 1) * span) / (m.uses.length + 1)));
        const before = left;
        left -= used;
        lastAt = at(day, 10 + ((index + i) % 6), (index * 7) % 60);
        insertTx.run(
          materialId, people[(index + i) % people.length], 'usage', -used, before, left,
          i === 0 ? 'Routine bench use' : null, lastAt,
        );
      });
      db.prepare('UPDATE materials SET updated_at = ? WHERE id = ?').run(lastAt, materialId);
    });
  });
}
