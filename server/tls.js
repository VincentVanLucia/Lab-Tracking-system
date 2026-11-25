// Self-signed development certificate so smartphones on the local network can use the
// camera-based QR scanner (browsers require HTTPS for getUserMedia, §7.2 / risk table §8).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate } from 'selfsigned';

export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

export async function loadOrCreateCertificate(config) {
  if (config.tlsKeyPath && config.tlsCertPath) {
    return { key: fs.readFileSync(config.tlsKeyPath), cert: fs.readFileSync(config.tlsCertPath), generated: false };
  }
  const dir = path.join(config.dataDir, 'certs');
  const keyPath = path.join(dir, 'dev-key.pem');
  const certPath = path.join(dir, 'dev-cert.pem');
  const metaPath = path.join(dir, 'dev-cert.json');
  const ips = ['127.0.0.1', ...lanAddresses()];
  const hostname = os.hostname();

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const stillValid = new Date(meta.notAfter) > new Date(Date.now() + 7 * 86_400_000);
    const coversIps = ips.every((ip) => meta.ips.includes(ip));
    if (stillValid && coversIps && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), generated: false };
    }
  } catch {
    // no usable certificate yet
  }

  const notAfter = new Date(Date.now() + 365 * 86_400_000);
  const pems = await generate([{ name: 'commonName', value: 'Lab Inventory (development)' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: hostname },
          ...ips.map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(metaPath, JSON.stringify({ ips, hostname, notAfter: notAfter.toISOString() }, null, 2));
  return { key: pems.private, cert: pems.cert, generated: true };
}
