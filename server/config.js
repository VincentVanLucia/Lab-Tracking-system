import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const int = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
  return {
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 3000),
    // Browsers only expose the camera (getUserMedia) in secure contexts, so phones on the
    // LAN need HTTPS. A self-signed certificate is generated automatically unless HTTPS=0.
    https: env.HTTPS !== '0',
    httpsPort: int(env.HTTPS_PORT, 3443),
    tlsKeyPath: env.TLS_KEY || null,
    tlsCertPath: env.TLS_CERT || null,
    dataDir,
    dbPath: env.DB_PATH || path.join(dataDir, 'inventory.db'),
    seedDemo: env.SEED_DEMO !== '0',
    sessionHours: int(env.SESSION_HOURS, 12),
    trustProxy: env.TRUST_PROXY || false,
  };
}
