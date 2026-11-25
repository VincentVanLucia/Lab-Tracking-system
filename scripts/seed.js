// Resets the database to the demo data set.  Usage: npm run seed [-- --force]
import fs from 'node:fs';
import { loadConfig } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { seedDemo, DEMO_USERS } from '../server/db/seed.js';
import { localIsoDate } from '../server/domain/status.js';

const config = loadConfig();
const force = process.argv.includes('--force');

if (fs.existsSync(config.dbPath)) {
  if (!force) {
    console.error(`${config.dbPath} already exists. Re-run with "npm run seed -- --force" to DELETE it and reload the demo data.`);
    console.error('Tip: "npm run backup" first if you want to keep a copy.');
    process.exit(1);
  }
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
}

const db = openDatabase(config.dbPath);
seedDemo(db, localIsoDate());
db.close();
console.log(`Demo database created at ${config.dbPath}`);
for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(8)} ${u.username} / ${u.password}`);
