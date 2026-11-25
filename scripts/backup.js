// Consistent online backup of the inventory database (risk mitigation §4 / §8).
// Usage: npm run backup            -> data/backups/inventory-YYYYMMDD-HHMMSS.db
// Restore: stop the server, then copy a backup file over data/inventory.db.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';

const config = loadConfig();
if (!fs.existsSync(config.dbPath)) {
  console.error(`No database found at ${config.dbPath}. Start the server once first.`);
  process.exit(1);
}

const dir = path.join(config.dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const target = path.join(dir, `inventory-${stamp}.db`);

const db = openDatabase(config.dbPath);
db.prepare('VACUUM INTO ?').run(target);
const { materials } = db.prepare('SELECT COUNT(*) AS materials FROM materials').get();
const { transactions } = db.prepare('SELECT COUNT(*) AS transactions FROM transactions').get();
db.close();

console.log(`Backup written to ${target} (${materials} materials, ${transactions} transactions).`);
