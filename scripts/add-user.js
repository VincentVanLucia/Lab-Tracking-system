// Creates a user account.  Usage: npm run user:add -- <username> <password> <manager|member|viewer> "Full Name"
import { loadConfig } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createUser } from '../server/db/seed.js';
import { ROLE_VALUES } from '../server/domain/options.js';

const [username, password, role, ...nameParts] = process.argv.slice(2);
const displayName = nameParts.join(' ') || username;

if (!username || !password || !ROLE_VALUES.includes(role)) {
  console.error('Usage: npm run user:add -- <username> <password> <manager|member|viewer> "Full Name"');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Choose a password with at least 8 characters.');
  process.exit(1);
}

const db = openDatabase(loadConfig().dbPath);
try {
  createUser(db, { username, password, role, displayName });
  console.log(`Created ${role} account "${username}" (${displayName}).`);
} catch (err) {
  if (String(err.message).includes('UNIQUE')) console.error(`The username "${username}" is already taken.`);
  else throw err;
  process.exitCode = 1;
} finally {
  db.close();
}
