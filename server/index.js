import http from 'node:http';
import https from 'node:https';

import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { seedDemo, DEMO_USERS } from './db/seed.js';
import { localIsoDate } from './domain/status.js';
import { createApp } from './app.js';
import { lanAddresses, loadOrCreateCertificate } from './tls.js';

const config = loadConfig();
const db = openDatabase(config.dbPath);

const { users } = db.prepare('SELECT COUNT(*) AS users FROM users').get();
if (users === 0) {
  if (config.seedDemo) {
    seedDemo(db, localIsoDate());
    console.log('Seeded demo data (10 sample materials). Demo accounts:');
    for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(8)} ${u.username} / ${u.password}`);
  } else {
    console.log('No user accounts exist yet. Create a manager with:  npm run user:add -- <username> <password> manager "Full Name"');
  }
}

const app = createApp({ db, config });

http.createServer(app).listen(config.port, config.host, () => {
  console.log(`\nLab Inventory running:\n  http://localhost:${config.port}   (this computer; camera works on localhost)`);
});

if (config.https) {
  const { key, cert, generated } = await loadOrCreateCertificate(config);
  https.createServer({ key, cert }, app).listen(config.httpsPort, config.host, () => {
    if (generated) console.log('  (generated a self-signed development certificate in data/certs/)');
    for (const ip of lanAddresses()) {
      console.log(`  https://${ip}:${config.httpsPort}   (smartphones on the same network — accept the certificate warning once)`);
    }
    console.log(`  https://localhost:${config.httpsPort}`);
  });
}

function shutdown() {
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
