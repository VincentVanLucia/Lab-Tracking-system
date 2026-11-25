// Text labels for every status. Colour is never the only signal (WCAG 2.2 SC 1.4.1, R9):
// each tone is always rendered with one of these labels and a distinct icon shape.
// Pure module (no DOM) so it can be unit-tested in Node.

export const TONE = Object.freeze({
  in_stock: 'ok',
  low_stock: 'warn',
  critical: 'crit',
  valid: 'ok',
  expiring_soon: 'warn',
  expired: 'crit',
});

export const STOCK_LABEL = Object.freeze({
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  critical: 'Critical',
});

export function expiryLabel(status, days) {
  if (status === 'expired') {
    return days === -1 ? 'Expired yesterday' : `Expired ${Math.abs(days)} days ago`;
  }
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (status === 'expiring_soon') return `Expires in ${days} days`;
  return `Valid · ${days} days left`;
}

export const STATUS_FILTERS = [
  { value: '', label: 'All materials' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'critical', label: 'Critical' },
  { value: 'expiring_soon', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'valid', label: 'Not expiring' },
];

export const TX_LABEL = Object.freeze({
  registration: 'Registered',
  usage: 'Usage',
  restock: 'Restock',
  correction: 'Count correction',
});

export const ACTION_LABEL = Object.freeze({
  'auth.login': 'Log in',
  'auth.logout': 'Log out',
  'materials.read': 'View inventory',
  'materials.create': 'Register material',
  'materials.update': 'Edit material',
  'materials.delete': 'Archive material',
  'materials.adjust': 'Adjust stock',
  'labels.read': 'View QR labels',
  'usage.create': 'Log usage',
  'usage.read': 'View usage history',
  'dashboard.read': 'View dashboard',
  'audit.read': 'View activity log',
});

/** Extracts the 4-digit material ID from a scanned QR payload ("LAB-0007") or typed text. */
export function parseMaterialId(text) {
  const s = String(text ?? '').trim();
  const m =
    /^LAB[-:\s]?(\d{4})$/i.exec(s) ||
    /^(\d{4})$/.exec(s) ||
    /\/materials\/(\d{4})(?:[/?#]|$)/.exec(s);
  return m && m[1] !== '0000' ? m[1] : null;
}

const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 });

export function formatAmount(value, unit) {
  const n = numberFormat.format(value);
  return unit ? `${n} ${unit}` : n;
}
