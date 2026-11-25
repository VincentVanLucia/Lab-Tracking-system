// Inventory business logic: registration (F1), lookup/search (F3), usage recording and
// quantity updates (F4, F5), expiration and stock monitoring (F6, F7) and reporting (F8).

import { nowIso, transaction } from '../db/index.js';
import { ApiError, notFound, validationError } from '../errors.js';
import { STOCK, EXPIRY, stockStatus, expiryStatus, round3 } from '../domain/status.js';
import { STORAGE_CONDITIONS } from '../domain/options.js';
import {
  normalizeMaterialId,
  validateMaterial,
  validateUsage,
  validateAdjustment,
} from '../domain/validation.js';

const STORAGE_LABELS = Object.fromEntries(STORAGE_CONDITIONS.map((s) => [s.value, s.label]));

export const STATUS_FILTERS = ['in_stock', 'low_stock', 'critical', 'valid', 'expiring_soon', 'expired', 'attention'];

const SEVERITY = { [STOCK.CRITICAL]: 2, [STOCK.LOW]: 1, [STOCK.IN_STOCK]: 0, [EXPIRY.EXPIRED]: 2, [EXPIRY.SOON]: 1, [EXPIRY.VALID]: 0 };

export function serializeMaterial(row, today) {
  const stock = stockStatus(row.quantity, row.low_stock_threshold, row.critical_stock_threshold);
  const expiry = expiryStatus(row.expiration_date, row.expiry_warning_days, today);
  return {
    id: row.code,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    initialQuantity: row.initial_quantity,
    unit: row.unit,
    lowStockThreshold: row.low_stock_threshold,
    criticalStockThreshold: row.critical_stock_threshold,
    expiryWarningDays: row.expiry_warning_days,
    openingDate: row.opening_date,
    expirationDate: row.expiration_date,
    storageCondition: row.storage_condition,
    storageConditionLabel: STORAGE_LABELS[row.storage_condition] ?? row.storage_condition,
    storageLocation: row.storage_location,
    lotNumber: row.lot_number,
    supplier: row.supplier,
    notes: row.notes,
    stockStatus: stock,
    expiryStatus: expiry.status,
    daysUntilExpiry: expiry.daysLeft,
    needsAttention: stock !== STOCK.IN_STOCK || expiry.status !== EXPIRY.VALID,
    severity: Math.max(SEVERITY[stock], SEVERITY[expiry.status]),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeTransaction(row) {
  return {
    id: row.id,
    materialId: row.code,
    materialName: row.material_name,
    unit: row.unit,
    type: row.type,
    quantity: Math.abs(row.quantity_change),
    change: row.quantity_change,
    quantityBefore: row.quantity_before,
    quantityAfter: row.quantity_after,
    note: row.note,
    user: { username: row.username, displayName: row.display_name },
    createdAt: row.created_at,
  };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class InventoryService {
  constructor(db, { today }) {
    this.db = db;
    this.today = today;
  }

  findRow(id) {
    const code = normalizeMaterialId(String(id ?? ''));
    if (!code) return null;
    return this.db.prepare('SELECT * FROM materials WHERE code = ? AND archived_at IS NULL').get(code) ?? null;
  }

  requireRow(id) {
    const row = this.findRow(id);
    if (!row) throw notFound(`No material with ID "${id}" was found. Check the ID printed under the QR code, or search by name.`);
    return row;
  }

  get(id) {
    return serializeMaterial(this.requireRow(id), this.today());
  }

  /** Searchable inventory table (F3, F8, R10): free-text on name/ID/lot/location + status filter. */
  list({ q = '', status = '', category = '' } = {}) {
    const where = ['archived_at IS NULL'];
    const params = [];
    const term = String(q).trim();
    if (term) {
      const code = normalizeMaterialId(term);
      const like = `%${escapeLike(term)}%`;
      where.push(`(name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR lot_number LIKE ? ESCAPE '\\' OR storage_location LIKE ? ESCAPE '\\'${code ? ' OR code = ?' : ''})`);
      params.push(like, `${escapeLike(term)}%`, like, like);
      if (code) params.push(code);
    }
    if (category) {
      where.push('category = ?');
      params.push(String(category));
    }
    const rows = this.db.prepare(`SELECT * FROM materials WHERE ${where.join(' AND ')} ORDER BY name COLLATE NOCASE`).all(...params);
    const today = this.today();
    let items = rows.map((r) => serializeMaterial(r, today));
    if (status) {
      if (!STATUS_FILTERS.includes(status)) {
        throw validationError({ status: `Unknown status filter. Use one of: ${STATUS_FILTERS.join(', ')}.` });
      }
      items = items.filter((m) =>
        status === 'attention' ? m.needsAttention : m.stockStatus === status || m.expiryStatus === status,
      );
    }
    return items;
  }

  nextAvailableId() {
    const rows = this.db.prepare('SELECT code FROM materials ORDER BY code').all();
    const used = new Set(rows.map((r) => r.code));
    for (let n = 1; n <= 9999; n++) {
      const code = String(n).padStart(4, '0');
      if (!used.has(code)) return code;
    }
    throw new ApiError(409, 'ID_SPACE_FULL', 'All 9,999 material IDs are in use.');
  }

  create(body, user) {
    const today = this.today();
    const { value, errors } = validateMaterial(body, { mode: 'create', today });
    if (Object.keys(errors).length) throw validationError(errors);

    return transaction(this.db, () => {
      const code = value.id ?? this.nextAvailableId();
      const clash = this.db.prepare('SELECT name, archived_at FROM materials WHERE code = ?').get(code);
      if (clash) {
        const who = clash.archived_at ? 'an archived material' : `"${clash.name}"`;
        throw validationError({ id: `ID ${code} is already used by ${who}. Leave the ID blank to assign the next free one, or choose another.` });
      }
      const now = nowIso();
      const { lastInsertRowid } = this.db.prepare(`
        INSERT INTO materials (code, name, category, quantity, initial_quantity, unit, low_stock_threshold,
          critical_stock_threshold, expiry_warning_days, opening_date, expiration_date, storage_condition,
          storage_location, lot_number, supplier, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        code, value.name, value.category, value.initialQuantity, value.initialQuantity, value.unit,
        value.lowStockThreshold, value.criticalStockThreshold, value.expiryWarningDays, value.openingDate,
        value.expirationDate, value.storageCondition, value.storageLocation, value.lotNumber, value.supplier,
        value.notes, user.id, now, now,
      );
      this.insertTransaction({
        materialId: lastInsertRowid, userId: user.id, type: 'registration',
        change: value.initialQuantity, before: 0, after: value.initialQuantity, note: 'Initial registration', at: now,
      });
      return this.get(code);
    });
  }

  update(id, body) {
    const row = this.requireRow(id);
    const { value, errors } = validateMaterial(body, { mode: 'update', today: this.today() });
    if (Object.keys(errors).length) throw validationError(errors);
    this.db.prepare(`
      UPDATE materials SET name = ?, category = ?, unit = ?, low_stock_threshold = ?, critical_stock_threshold = ?,
        expiry_warning_days = ?, opening_date = ?, expiration_date = ?, storage_condition = ?, storage_location = ?,
        lot_number = ?, supplier = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      value.name, value.category, value.unit, value.lowStockThreshold, value.criticalStockThreshold,
      value.expiryWarningDays, value.openingDate, value.expirationDate, value.storageCondition,
      value.storageLocation, value.lotNumber, value.supplier, value.notes, nowIso(), row.id,
    );
    return this.get(row.code);
  }

  /** Soft delete: the material leaves the inventory but its usage history is preserved (R5). */
  archive(id) {
    const row = this.requireRow(id);
    this.db.prepare('UPDATE materials SET archived_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), row.id);
    return { id: row.code, name: row.name };
  }

  /**
   * Records a usage transaction (F4/F5): validates the amount, decrements stock and writes the
   * transaction atomically. Invalid input leaves the database untouched (R8).
   */
  recordUsage(body, user) {
    if (!body || typeof body !== 'object') throw validationError({ form: 'Send the usage as a JSON object.' });
    const rawId = body.materialId;
    if (typeof rawId !== 'string' || !normalizeMaterialId(rawId)) {
      throw validationError({ materialId: 'Enter the 4-digit material ID printed under the QR code.' });
    }
    return transaction(this.db, () => {
      const row = this.requireRow(rawId);
      const { value, errors } = validateUsage(body, row);
      const today = this.today();
      if (row.expiration_date < today && body.confirmExpired !== true) {
        errors.confirmExpired = `This material expired on ${row.expiration_date}. Confirm that you have verified it is still suitable before logging usage.`;
      }
      if (Object.keys(errors).length) throw validationError(errors);

      const after = round3(row.quantity - value.quantity);
      const at = nowIso();
      const result = this.db
        .prepare('UPDATE materials SET quantity = ?, updated_at = ? WHERE id = ? AND quantity = ?')
        .run(after, at, row.id, row.quantity);
      if (result.changes !== 1) throw new ApiError(409, 'CONFLICT', 'The stock changed while you were logging usage. Reload and try again.');
      const txId = this.insertTransaction({
        materialId: row.id, userId: user.id, type: 'usage', change: -value.quantity,
        before: row.quantity, after, note: value.note, at,
      });
      return { transaction: this.getTransaction(txId), material: this.get(row.code) };
    });
  }

  adjust(id, body, user) {
    return transaction(this.db, () => {
      const row = this.requireRow(id);
      const { value, errors } = validateAdjustment(body, row);
      if (Object.keys(errors).length) throw validationError(errors);
      const after = value.type === 'restock' ? round3(row.quantity + value.quantity) : value.quantity;
      const change = round3(after - row.quantity);
      const at = nowIso();
      this.db.prepare('UPDATE materials SET quantity = ?, updated_at = ? WHERE id = ?').run(after, at, row.id);
      const txId = this.insertTransaction({
        materialId: row.id, userId: user.id, type: value.type, change, before: row.quantity, after, note: value.note, at,
      });
      return { transaction: this.getTransaction(txId), material: this.get(row.code) };
    });
  }

  insertTransaction({ materialId, userId, type, change, before, after, note = null, at }) {
    const { lastInsertRowid } = this.db.prepare(`
      INSERT INTO transactions (material_id, user_id, type, quantity_change, quantity_before, quantity_after, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(materialId, userId, type, change, before, after, note ?? null, at);
    return Number(lastInsertRowid);
  }

  static TX_SELECT = `
    SELECT t.*, m.code, m.name AS material_name, m.unit, u.username, u.display_name
    FROM transactions t
    JOIN materials m ON m.id = t.material_id
    JOIN users u ON u.id = t.user_id
  `;

  getTransaction(id) {
    return serializeTransaction(this.db.prepare(`${InventoryService.TX_SELECT} WHERE t.id = ?`).get(id));
  }

  /** Usage history (R5, R12) with optional material/type filter and pagination. */
  listTransactions({ materialId = '', type = '', limit = 25, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (materialId) {
      const code = normalizeMaterialId(String(materialId));
      if (!code) throw validationError({ materialId: 'Use a 4-digit material ID.' });
      where.push('m.code = ?');
      params.push(code);
    }
    if (type) {
      const types = String(type).split(',');
      if (!types.every((t) => ['registration', 'usage', 'restock', 'correction'].includes(t))) {
        throw validationError({ type: 'Unknown transaction type.' });
      }
      where.push(`t.type IN (${types.map(() => '?').join(', ')})`);
      params.push(...types);
    }
    const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM transactions t JOIN materials m ON m.id = t.material_id ${clause}`)
      .get(...params);
    const rows = this.db
      .prepare(`${InventoryService.TX_SELECT} ${clause} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`)
      .all(...params, lim, off);
    return { items: rows.map(serializeTransaction), total, limit: lim, offset: off };
  }

  /** Stock- and expiration-status dashboard (F8, R12). */
  dashboard() {
    const materials = this.list();
    const count = (pred) => materials.filter(pred).length;
    const attention = materials
      .filter((m) => m.needsAttention)
      .sort((a, b) => b.severity - a.severity || a.daysUntilExpiry - b.daysUntilExpiry || a.name.localeCompare(b.name));
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { usage7d } = this.db
      .prepare(`SELECT COUNT(*) AS usage7d FROM transactions WHERE type = 'usage' AND created_at >= ?`)
      .get(weekAgo);
    return {
      today: this.today(),
      totals: {
        materials: materials.length,
        needsAttention: attention.length,
        usageLast7Days: usage7d,
        stock: {
          in_stock: count((m) => m.stockStatus === STOCK.IN_STOCK),
          low_stock: count((m) => m.stockStatus === STOCK.LOW),
          critical: count((m) => m.stockStatus === STOCK.CRITICAL),
        },
        expiry: {
          valid: count((m) => m.expiryStatus === EXPIRY.VALID),
          expiring_soon: count((m) => m.expiryStatus === EXPIRY.SOON),
          expired: count((m) => m.expiryStatus === EXPIRY.EXPIRED),
        },
      },
      attention,
      recentUsage: this.listTransactions({ type: 'usage', limit: 8 }).items,
    };
  }
}
