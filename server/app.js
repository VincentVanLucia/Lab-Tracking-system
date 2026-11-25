// HTTP layer: the JSON REST API described in §7.2 of the design document plus static frontend.
//
//   POST /api/auth/login          authentication and role token
//   GET  /api/materials?q=&status= searchable inventory table and filters
//   GET  /api/materials/{id}       QR / printed-ID lookup
//   POST /api/materials            material registration form submission
//   POST /api/usage                usage transaction dialog submission
//   GET  /api/dashboard            stock/expiration summary and usage history
//
// plus supporting endpoints for editing, archiving, stock adjustments, labels and the access log.

import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import QRCode from 'qrcode';

import { ROOT } from './config.js';
import { ApiError, validationError } from './errors.js';
import { localIsoDate, DEFAULT_EXPIRY_WARNING_DAYS } from './domain/status.js';
import { CATEGORIES, UNITS, STORAGE_CONDITIONS, ROLES } from './domain/options.js';
import { InventoryService } from './services/inventory.js';
import { verifyPassword, DUMMY_HASH } from './auth/passwords.js';
import {
  PERMISSIONS,
  authenticate,
  authorizer,
  can,
  createSession,
  deleteSession,
  logAccess,
  publicUser,
} from './auth/access.js';

const require = createRequire(import.meta.url);
const JSQR_PATH = require.resolve('jsqr/dist/jsQR.js');
const PUBLIC_DIR = path.join(ROOT, 'public');

const permissionsFor = (role) => Object.keys(PERMISSIONS).filter((p) => can(role, p));

function securityHeaders(_req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  });
  next();
}

/** Small in-memory limiter for failed logins (per IP + username). */
function createLoginLimiter({ max = 8, windowMs = 15 * 60_000 } = {}) {
  const failures = new Map();
  const keyOf = (req) => `${req.ip}|${String(req.body?.username ?? '').trim().toLowerCase()}`;
  return {
    check(req) {
      const entry = failures.get(keyOf(req));
      if (entry && Date.now() - entry.first > windowMs) failures.delete(keyOf(req));
      else if (entry && entry.count >= max) {
        throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed login attempts. Wait 15 minutes and try again, or ask a lab manager to reset your password.');
      }
    },
    fail(req) {
      const key = keyOf(req);
      const entry = failures.get(key) ?? { count: 0, first: Date.now() };
      entry.count += 1;
      failures.set(key, entry);
    },
    reset(req) {
      failures.delete(keyOf(req));
    },
  };
}

export function createApp({ db, config = {}, today = () => localIsoDate() }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  const inventory = new InventoryService(db, { today });
  const authorize = authorizer(db);
  const loginLimiter = createLoginLimiter(config.loginLimit);
  const sessionHours = config.sessionHours ?? 12;

  app.use(securityHeaders);
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: '100kb' }));
  app.use('/api', authenticate(db));

  // ---- Authentication (F9) -------------------------------------------------
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const fields = {};
    if (typeof username !== 'string' || !username.trim()) fields.username = 'Enter your username.';
    if (typeof password !== 'string' || !password) fields.password = 'Enter your password.';
    if (Object.keys(fields).length) throw validationError(fields);

    loginLimiter.check(req);
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username.trim());
    const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH) && Boolean(user);
    if (!ok) {
      loginLimiter.fail(req);
      logAccess(db, req, {
        action: 'auth.login',
        outcome: 'failed',
        reason: 'Invalid username or password',
        user: user ?? { username: username.trim().slice(0, 60) },
      });
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'The username or password is incorrect.');
    }
    loginLimiter.reset(req);
    const session = createSession(db, user.id, sessionHours);
    logAccess(db, req, { action: 'auth.login', outcome: 'allowed', user });
    res.json({ ...session, user: publicUser(user), permissions: permissionsFor(user.role) });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.token) deleteSession(db, req.token);
    if (req.user) logAccess(db, req, { action: 'auth.logout', outcome: 'allowed' });
    res.status(204).end();
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    res.json({ user: publicUser(req.user), permissions: permissionsFor(req.user.role) });
  });

  app.get('/api/meta', authorize('materials.read'), (_req, res) => {
    res.json({
      categories: CATEGORIES,
      units: UNITS,
      storageConditions: STORAGE_CONDITIONS,
      roles: ROLES,
      defaults: { expiryWarningDays: DEFAULT_EXPIRY_WARNING_DAYS },
      today: today(),
    });
  });

  // ---- Materials (F1, F3, F6, F7) -----------------------------------------
  app.get('/api/materials', authorize('materials.read'), (req, res) => {
    const items = inventory.list({ q: req.query.q ?? '', status: req.query.status ?? '', category: req.query.category ?? '' });
    res.json({ items, total: items.length, today: today() });
  });

  app.get('/api/materials/next-id', authorize('materials.create'), (_req, res) => {
    res.json({ id: inventory.nextAvailableId() });
  });

  app.get('/api/materials/:id', authorize('materials.read'), (req, res) => {
    res.json({ material: inventory.get(req.params.id) });
  });

  app.post('/api/materials', authorize('materials.create'), (req, res) => {
    const material = inventory.create(req.body, req.user);
    logAccess(db, req, { action: 'materials.create', outcome: 'allowed', reason: `Registered ${material.id} ${material.name}` });
    res.status(201).json({ material });
  });

  app.put('/api/materials/:id', authorize('materials.update'), (req, res) => {
    const material = inventory.update(req.params.id, req.body);
    logAccess(db, req, { action: 'materials.update', outcome: 'allowed', reason: `Edited ${material.id} ${material.name}` });
    res.json({ material });
  });

  app.delete('/api/materials/:id', authorize('materials.delete'), (req, res) => {
    const archived = inventory.archive(req.params.id);
    logAccess(db, req, { action: 'materials.delete', outcome: 'allowed', reason: `Archived ${archived.id} ${archived.name}` });
    res.json({ archived });
  });

  app.post('/api/materials/:id/adjustments', authorize('materials.adjust'), (req, res) => {
    const result = inventory.adjust(req.params.id, req.body, req.user);
    const t = result.transaction;
    logAccess(db, req, {
      action: 'materials.adjust',
      outcome: 'allowed',
      reason: `${t.type} ${t.materialId}: ${t.quantityBefore} → ${t.quantityAfter} ${t.unit}`,
    });
    res.status(201).json(result);
  });

  // ---- QR labels (F2) ------------------------------------------------------
  app.get('/api/labels', authorize('labels.read'), async (req, res) => {
    const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : null;
    const materials = ids ? ids.map((id) => inventory.get(id)) : inventory.list();
    const labels = await Promise.all(
      materials.map(async (m) => {
        const payload = `LAB-${m.id}`;
        // Error-correction level H tolerates ~30% symbol damage (label wear, §3.1 / §8).
        const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'H', margin: 1 });
        return {
          id: m.id,
          name: m.name,
          storageConditionLabel: m.storageConditionLabel,
          expirationDate: m.expirationDate,
          lotNumber: m.lotNumber,
          payload,
          svg,
        };
      }),
    );
    res.json({ labels });
  });

  // ---- Usage transactions (F4, F5) ----------------------------------------
  app.post('/api/usage', authorize('usage.create'), (req, res) => {
    res.status(201).json(inventory.recordUsage(req.body, req.user));
  });

  app.get('/api/usage', authorize('usage.read'), (req, res) => {
    res.json(inventory.listTransactions({
      materialId: req.query.materialId ?? '',
      type: req.query.type ?? '',
      limit: req.query.limit,
      offset: req.query.offset,
    }));
  });

  // ---- Dashboard and access log (F8, F9) ----------------------------------
  app.get('/api/dashboard', authorize('dashboard.read'), (_req, res) => {
    res.json(inventory.dashboard());
  });

  app.get('/api/audit', authorize('audit.read'), (req, res) => {
    const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const off = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const outcome = ['allowed', 'denied', 'failed'].includes(req.query.outcome) ? req.query.outcome : null;
    const where = outcome ? 'WHERE outcome = ?' : '';
    const params = outcome ? [outcome] : [];
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM access_log ${where}`).get(...params);
    const items = db
      .prepare(`SELECT * FROM access_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, lim, off)
      .map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        username: r.username,
        role: r.role,
        action: r.action,
        method: r.method,
        path: r.path,
        outcome: r.outcome,
        reason: r.reason,
        ip: r.ip,
      }));
    res.json({ items, total, limit: lim, offset: off });
  });

  app.use('/api', (_req, _res) => {
    throw new ApiError(404, 'NOT_FOUND', 'Unknown API endpoint.');
  });

  // ---- Frontend --------------------------------------------------------------
  // `root` keeps the dot-file check on the file name only (the install path may contain dot folders).
  app.get('/vendor/jsQR.js', (_req, res) => res.sendFile(path.basename(JSQR_PATH), { root: path.dirname(JSQR_PATH) }));
  // The pure domain modules (validation + status rules) are shared with the browser so the
  // registration form and usage dialog validate exactly like the server does.
  app.use('/shared', express.static(path.join(ROOT, 'server', 'domain')));
  app.use(express.static(PUBLIC_DIR));

  // ---- Errors ----------------------------------------------------------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let status = 500;
    let body = { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Try again, and contact the lab manager if it keeps happening.' };
    if (err instanceof ApiError) {
      status = err.status;
      body = { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) };
    } else if (err.type === 'entity.parse.failed') {
      status = 400;
      body = { code: 'BAD_JSON', message: 'The request body is not valid JSON.' };
    } else if (err.type === 'entity.too.large') {
      status = 413;
      body = { code: 'TOO_LARGE', message: 'The request is too large.' };
    } else {
      console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    }
    res.status(status).json({ error: body });
  });

  return app;
}
