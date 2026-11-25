// Login session (role token from POST /api/auth/login). Kept in sessionStorage so closing the
// browser on a shared bench computer logs the user out.

const KEY = 'labinv.session';

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

let state = load();

function save() {
  try {
    if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable (private mode): the session lives in memory only
  }
}

export const session = {
  get token() {
    return state?.token ?? null;
  },
  get user() {
    return state?.user ?? null;
  },
  get permissions() {
    return state?.permissions ?? [];
  },
  can(permission) {
    return this.permissions.includes(permission);
  },
  set({ token, expiresAt, user, permissions }) {
    state = { token, expiresAt, user, permissions };
    save();
  },
  update({ user, permissions }) {
    if (!state) return;
    state = { ...state, user, permissions };
    save();
  },
  clear() {
    state = null;
    save();
  },
};

export const ROLE_LABELS = { manager: 'Lab manager', member: 'Lab member', viewer: 'Read-only' };
