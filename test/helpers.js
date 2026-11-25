import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openDatabase } from '../server/db/index.js';
import { seedDemo, seedUsers } from '../server/db/seed.js';
import { createApp } from '../server/app.js';
import { addDays } from '../server/domain/status.js';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');

export const TODAY = '2026-11-25';
export const day = (offset) => addDays(TODAY, offset);

/** Starts the real Express app on a random port with an in-memory database. */
export async function startServer({ demo = false } = {}) {
  const db = openDatabase(':memory:');
  if (demo) seedDemo(db, TODAY);
  else seedUsers(db);
  const app = createApp({ db, today: () => TODAY, config: { loginLimit: { max: 1000 } } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = 'GET', token, body, rawBody } = {}) {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined || rawBody !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + path, {
      method,
      headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function login(username, password = `${username}123`) {
    const r = await request('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(r.status, 200, `login ${username}: ${JSON.stringify(r.body)}`);
    return r.body.token;
  }

  return { db, base, request, login, close: () => new Promise((r) => server.close(r)) };
}

/**
 * Rasterises the SVG produced by the label endpoint and decodes it with jsQR — the same
 * decoder the browser scanner falls back to — so R1 is checked end to end.
 */
export function decodeQrSvg(svg, scale = 6) {
  const size = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)[1]);
  const d = /stroke="#000000"[^>]*d="([^"]+)"/.exec(svg)[1];
  const dark = new Uint8Array(size * size);
  let x = 0;
  let y = 0;
  for (const [, cmd, a, b] of d.matchAll(/([Mmh])([\d.]+)(?: ([\d.]+))?/g)) {
    if (cmd === 'M') {
      x = Number(a);
      y = Math.floor(Number(b));
    } else if (cmd === 'm') {
      x += Number(a);
    } else {
      for (let i = 0; i < Number(a); i++) dark[y * size + x + i] = 1;
      x += Number(a);
    }
  }
  const quiet = 4; // extra white border, as on a printed label
  const px = (size + quiet * 2) * scale;
  const rgba = new Uint8ClampedArray(px * px * 4).fill(255);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!dark[row * size + col]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((row + quiet) * scale + dy) * px + (col + quiet) * scale + dx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  }
  return jsQR(rgba, px, px)?.data ?? null;
}
