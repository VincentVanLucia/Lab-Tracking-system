// JSON API client. Shows a global loading indicator whenever a request takes longer than
// 1 second (R7 / §3.1: responses over 1 s need visible feedback).

import { session } from './session.js';

export const LOADING_DELAY_MS = 1000;

let pending = 0;
let timer = null;

function setLoading(on) {
  document.body.classList.toggle('is-loading', on);
  const status = document.getElementById('loading-status');
  if (status) status.textContent = on ? 'Loading…' : '';
}

function begin() {
  pending += 1;
  if (pending === 1) timer = setTimeout(() => setLoading(true), LOADING_DELAY_MS);
}

function end() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    clearTimeout(timer);
    setLoading(false);
  }
}

export class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  begin();
  try {
    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        cache: 'no-store',
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your network connection and try again.');
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = data?.error ?? {};
      if (res.status === 401 && path !== '/auth/login') {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      throw new ApiError(res.status, e.code ?? 'HTTP_ERROR', e.message ?? `Request failed (${res.status}).`, e.fields ?? {});
    }
    return data;
  } finally {
    end();
  }
}

let metaPromise = null;

/** Option lists (categories, units, storage conditions), cached per login. */
export function getMeta() {
  metaPromise ??= api('/meta').catch((err) => {
    metaPromise = null;
    throw err;
  });
  return metaPromise;
}

export function resetMeta() {
  metaPromise = null;
}
