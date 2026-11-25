// Authentication, role-based authorization and the access log (F9, R11).

import crypto from 'node:crypto';
import { nowIso } from '../db/index.js';
import { ApiError } from '../errors.js';

/** Which roles may perform each operation. Single source of truth for R11. */
export const PERMISSIONS = Object.freeze({
  'materials.read': ['manager', 'member', 'viewer'],
  'materials.create': ['manager'],
  'materials.update': ['manager'],
  'materials.delete': ['manager'],
  'materials.adjust': ['manager'],
  'labels.read': ['manager', 'member'],
  'usage.create': ['manager', 'member'],
  'usage.read': ['manager', 'member', 'viewer'],
  'dashboard.read': ['manager', 'member', 'viewer'],
  'audit.read': ['manager'],
});

export function can(role, permission) {
  return Boolean(role && PERMISSIONS[permission]?.includes(role));
}

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createSession(db, userId, hours) {
  const token = crypto.randomBytes(32).toString('base64url');
  const created = new Date();
  const expires = new Date(created.getTime() + hours * 3_600_000);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(created.toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    created.toISOString(),
    expires.toISOString(),
  );
  return { token, expiresAt: expires.toISOString() };
}

export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function publicUser(user) {
  return { username: user.username, displayName: user.display_name, role: user.role };
}

/** Express middleware: attaches req.user when a valid bearer token is present. */
export function authenticate(db) {
  const lookup = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
  `);
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(header);
    if (match) {
      req.token = match[1];
      req.user = lookup.get(hashToken(match[1]), nowIso()) ?? null;
    } else {
      req.user = null;
    }
    next();
  };
}

export function logAccess(db, req, { action, outcome, reason = null, user = req.user }) {
  db.prepare(`
    INSERT INTO access_log (created_at, user_id, username, role, action, method, path, outcome, reason, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nowIso(),
    user?.id ?? null,
    user?.username ?? null,
    user?.role ?? null,
    action,
    req.method,
    req.originalUrl.slice(0, 300),
    outcome,
    reason ? String(reason).slice(0, 500) : null,
    req.ip ?? null,
  );
}

/**
 * Express middleware factory: rejects unauthenticated (401) or under-privileged (403)
 * requests for `permission`, logging every rejection to the access log.
 */
export function authorizer(db) {
  return (permission) => (req, _res, next) => {
    if (!req.user) {
      logAccess(db, req, {
        action: permission,
        outcome: 'denied',
        reason: req.token ? 'Session expired or invalid' : 'Not logged in',
      });
      throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    }
    if (!can(req.user.role, permission)) {
      logAccess(db, req, { action: permission, outcome: 'denied', reason: `Role "${req.user.role}" lacks permission` });
      throw new ApiError(403, 'FORBIDDEN', 'Your account does not have permission to do this. Ask a lab manager.');
    }
    next();
  };
}
