# Smart Laboratory Inventory and Reagent Tracking System

A working prototype of the **QR code-based digital inventory system** chosen in Section 7 of
the Group 6 *Interdisciplinary Design Project: Project Analysis and Requirement Assessment*.
Lab staff scan a container's QR label with a phone, log how much they used, and see
stock and expiry warnings. Managers register materials, print labels and review the
dashboard and access log.

- **Hardware:** existing phones, computers and printed QR labels only. There is no firmware.
- **Frontend:** a responsive web app (plain ES modules, no build step) aimed at WCAG 2.2.
- **Backend:** Node.js + Express with a JSON REST API.
- **Database:** SQLite, using Node's built-in `node:sqlite`, so nothing native has to be compiled.

## Quick start

Requirements: **Node.js 22.13 or newer** (tested with Node 25).

```bash
npm install
npm start
```

The first start creates `data/inventory.db` with **10 fictional sample materials** and these demo accounts:

| Role | Username | Password | Can do |
|------|----------|----------|--------|
| Lab manager | `manager` | `manager123` | Everything: register, edit, archive, adjust stock, labels, activity log |
| Lab member | `member` | `member123` | View, scan, search, **log usage**, print labels |
| Read-only | `viewer` | `viewer123` | View only |

Open <http://localhost:3000> on the computer.

### Using a phone to scan (HTTPS)

Browsers only allow camera access on secure (HTTPS) pages. On startup the server creates a
self-signed certificate and prints addresses like:

```
https://192.168.1.23:3443   (smartphones on the same network — accept the certificate warning once)
```

Connect the phone to the same Wi-Fi and open that address. Accept the warning ("Advanced" →
"Proceed"), log in and tap **Scan**. If the camera can't be used, the Scan page falls back to
typing the ID and to the searchable inventory table.

## Features → requirements

| Feature | Requirements |
|---------|--------------|
| QR labels with error-correction level H and the 4-digit ID printed beside the code; printable 62 × 30 mm sheet | R1 (F2) |
| Camera scanner (native `BarcodeDetector`, or jsQR as fallback) plus manual ID entry | R1, R7, R10 |
| Usage dialog: numeric keypad, unit shown next to the field, inline errors, blocks over-stock, zero, negative and non-numeric amounts; requires confirmation before using an expired material | R2, R5, R8, R9 |
| Stock status **In Stock / Low Stock / Critical** and expiry status **Valid / Expires in N days / Expired**, always shown as colour + icon + text | R3, R4, R9 |
| Expiry warning threshold: 30 days by default, adjustable per material; low and critical stock thresholds set per material | R3, R4 |
| Searchable, filterable, sortable inventory table (cards on phones) | R10, R12 |
| Dashboard: status tiles, "needs attention" list, paginated usage history | R12 |
| Roles (manager / member / read-only); every denied attempt is written to the access log | R11 |
| Loading indicator after 1 s; measured retrieval time shown on screen | R7 |
| Registration form with an error summary and field-level messages; validation rules are shared by browser and server | R6, R8, R9 |
| Stock restock / count correction with a recorded reason; archiving keeps history | §4, §8 mitigations |
| `npm run backup` (consistent SQLite snapshot) | §4, §8 mitigations |

See [`docs/verification.md`](docs/verification.md) for the full requirement traceability
matrix and the manual demonstration script.

## Commands

| Command | What it does |
|---------|--------------|
| `npm start` | Starts HTTP on :3000 and HTTPS on :3443 |
| `npm run dev` | Same as `start`, restarting when files change |
| `npm test` | Requirement verification suite (R1–R12), domain unit tests, WCAG contrast audit |
| `npm run seed -- --force` | **Deletes** the database and reloads the demo data |
| `npm run backup` | Writes `data/backups/inventory-<timestamp>.db` |
| `npm run user:add -- <username> <password> <manager\|member\|viewer> "Full Name"` | Creates an account |

### Configuration (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` / `HTTPS_PORT` | `3000` / `3443` | Listening ports |
| `HTTPS` | on | Set `HTTPS=0` to disable the HTTPS listener |
| `TLS_KEY`, `TLS_CERT` | — | Use your own certificate instead of the generated one |
| `DATA_DIR` / `DB_PATH` | `./data` / `./data/inventory.db` | Where data is stored |
| `SEED_DEMO` | on | Set `SEED_DEMO=0` to start with an empty database (then create a manager with `user:add`) |
| `SESSION_HOURS` | `12` | Login session lifetime |

## REST API

The six primary endpoints from §7.2 of the design document, plus the supporting ones. All
endpoints except login take `Authorization: Bearer <token>`.

| Method & path | Purpose | Roles |
|---------------|---------|-------|
| `POST /api/auth/login` | Returns a session token, the user and their permissions | public |
| `GET /api/materials?q=&status=&category=` | Searchable inventory table. `status` is one of `in_stock`, `low_stock`, `critical`, `valid`, `expiring_soon`, `expired` or `attention` | all |
| `GET /api/materials/{id}` | Look up by printed ID (`0007`) or QR payload (`LAB-0007`) | all |
| `POST /api/materials` | Register a material | manager |
| `POST /api/usage` | Log usage `{ materialId, quantity, note?, confirmExpired? }`. Returns the new stock, or `422` with field errors | manager, member |
| `GET /api/dashboard` | Status counts, the "needs attention" list and recent usage | all |
| `GET /api/usage?materialId=&type=&limit=&offset=` | Usage / transaction history | all |
| `PUT /api/materials/{id}` · `DELETE /api/materials/{id}` | Edit · archive (history kept) | manager |
| `POST /api/materials/{id}/adjustments` | `{ type: "restock" \| "correction", quantity, note }` | manager |
| `GET /api/labels?ids=0001,0002` | QR label SVGs | manager, member |
| `GET /api/audit?outcome=denied` | Access log | manager |

Errors always look like `{ "error": { "code", "message", "fields"? } }`.

## Project layout

```
server/
  app.js               Express app: routes, security headers, error handling
  index.js             Entry point: database, demo seed, HTTP + HTTPS listeners
  auth/                Password hashing, sessions, role permissions, access log
  db/                  Schema/migrations and demo seed data
  domain/              Pure rules shared with the browser (/shared): status + validation
  services/inventory.js  Registration, lookup, usage, adjustments, dashboard
public/
  index.html, css/app.css
  js/app.js            Router and navigation
  js/views/            login, dashboard, inventory, scan, material, material-form, labels, activity, menu
scripts/               seed, backup, add-user
test/                  requirements.test.js (R1–R12), domain, frontend and contrast tests
docs/verification.md   Requirement traceability and manual test script
```

## Out of scope

As decided in §7.2 item 6, this prototype does **not** include native app-store builds, offline
sync, automatic weight or liquid-level measurement, supplier/ERP purchasing, or consumption
trend charts.

## Data protection

The prototype stores only usernames, display names and transaction records for fictional
materials. Before real use with real users (§4.1, KVKK), you need to:
- replace the demo accounts;
- use a real TLS certificate;
- restrict access to the server;
- schedule `npm run backup`.
