import { api, resetMeta } from './api.js';
import { session } from './session.js';
import { setFlash } from './ui.js';

/** Navigate to a hash route (re-renders even when already on that route). */
export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  session.clear();
  resetMeta();
  setFlash('info', 'You have been logged out.');
  go('#/login');
}
