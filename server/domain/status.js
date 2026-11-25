// Stock and expiration status rules (F6, F7 / R3, R4).
// Pure functions: no database or clock access, so they can be unit-tested directly.

export const STOCK = Object.freeze({
  IN_STOCK: 'in_stock',
  LOW: 'low_stock',
  CRITICAL: 'critical',
});

export const EXPIRY = Object.freeze({
  VALID: 'valid',
  SOON: 'expiring_soon',
  EXPIRED: 'expired',
});

export const DEFAULT_EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * "Reach or fall below" a threshold counts as crossing it (R4), so comparisons are inclusive.
 */
export function stockStatus(quantity, lowThreshold, criticalThreshold) {
  if (quantity <= criticalThreshold) return STOCK.CRITICAL;
  if (quantity <= lowThreshold) return STOCK.LOW;
  return STOCK.IN_STOCK;
}

/** Parses a strict YYYY-MM-DD calendar date to a UTC timestamp, or null if invalid. */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const t = Date.UTC(y, mo, d);
  const date = new Date(t);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo || date.getUTCDate() !== d) return null;
  return t;
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetween(fromIso, toIso) {
  return Math.round((parseIsoDate(toIso) - parseIsoDate(fromIso)) / DAY_MS);
}

/** Days remaining = expiration date − current date (§6.1.3). Warn when daysLeft ≤ warningDays. */
export function expiryStatus(expirationDate, warningDays, today) {
  const daysLeft = daysBetween(today, expirationDate);
  let status = EXPIRY.VALID;
  if (daysLeft < 0) status = EXPIRY.EXPIRED;
  else if (daysLeft <= warningDays) status = EXPIRY.SOON;
  return { status, daysLeft };
}

/** Today's calendar date in the server's local time zone, as YYYY-MM-DD. */
export function localIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, days) {
  return new Date(parseIsoDate(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Quantities are kept to 3 decimal places to avoid floating-point drift (R2: 100% accuracy). */
export function round3(n) {
  return Math.round(n * 1000) / 1000;
}
