// Controlled vocabularies shared by the API and the registration form (GET /api/meta).

export const CATEGORIES = ['Chemical', 'Enzyme', 'Protein', 'Kit', 'Other'];

export const UNITS = ['mL', 'µL', 'L', 'g', 'mg', 'µg', 'U', 'vials', 'tubes', 'kits', 'preps', 'tests', 'pcs'];

export const STORAGE_CONDITIONS = [
  { value: 'room_temp', label: 'Room temperature (15–25 °C)' },
  { value: 'refrigerated', label: 'Refrigerated (2–8 °C)' },
  { value: 'frozen_20', label: 'Frozen (−20 °C)' },
  { value: 'frozen_80', label: 'Ultra-low freezer (−80 °C)' },
  { value: 'liquid_nitrogen', label: 'Liquid nitrogen (−196 °C)' },
];

export const ROLES = [
  { value: 'manager', label: 'Lab manager' },
  { value: 'member', label: 'Lab member' },
  { value: 'viewer', label: 'Read-only' },
];

export const TRANSACTION_TYPES = ['registration', 'usage', 'restock', 'correction'];

export const STORAGE_VALUES = STORAGE_CONDITIONS.map((s) => s.value);
export const ROLE_VALUES = ROLES.map((r) => r.value);
