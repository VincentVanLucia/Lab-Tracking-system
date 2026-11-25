# Requirement verification and traceability

This maps each requirement in Section 1 of *Project Analysis and Requirement Assessment*
(Group 6) to the code that implements it and to how it is verified. Run the automated checks
with `npm test`.

| ID | Requirement (short) | Implemented in | Automated check (`npm test`) | Manual step still needed |
|----|---------------------|----------------|------------------------------|--------------------------|
| R1 | Identify registered materials by tag, 100% of 10 | `GET /api/labels` (QR, error-correction H, payload `LAB-0007`), `public/js/views/scan.js` | `R1` decodes each label's SVG with jsQR (the browser's fallback decoder) and checks it resolves to the right record, 10/10 | Scan the 10 printed labels with a phone camera |
| R2 | Remaining quantity after each use, 100% over 20 transactions | `InventoryService.recordUsage` (atomic update + transaction row) | `R2 + R5` compares 20 transactions with hand-calculated values, including the §6.1.2 example 100 − (12 + 8 + 15) = 65 mL | — |
| R3 | Expiry warnings, 30-day default threshold, adjustable per material | `server/domain/status.js#expiryStatus`, field `expiryWarningDays` | `R3` (boundaries at 0, 18, 30, 31 days, expired, per-material 60 and 14 days) and domain unit tests | — |
| R4 | Stock-threshold alerts, green/yellow/red with text, 20 cases | `stockStatus`, badges in `public/js/ui.js` | `R4` puts a material through 20 quantities above, at and below the low (20 mL) and critical (10 mL) thresholds; material page, table filter and dashboard must agree each time | Visual check of the badges |
| R5 | Complete usage records (material, user, time, quantity) | `transactions` table, `GET /api/usage` | `R2 + R5` checks all four fields on all 20 records | — |
| R6 | Mandatory material fields stored and displayed | Registration form `views/material-form.js`, `validateMaterial` | `R6` registers 10 materials through `POST /api/materials` and checks the DB rows and API views | Review the detail page for each sample |
| R7 | Retrieval ≤ 3 s, loading feedback after 1 s | `public/js/perf.js` (shows "Retrieved in N ms" on the material page and in the search results), `api.js` 1-s loading indicator | `R7` checks the server-side portion for 10 lookups and 10 searches | Measure on the demo phone with DevTools or a stopwatch; the app shows each measured time on screen |
| R8 | Reject invalid usage (over stock, zero/negative, non-numeric) | `validateUsage` (shared by browser and server), inline errors | `R8` submits 10 invalid quantities and checks each gets 422 with a message, with no DB change | — |
| R9 | Accessible UI (WCAG 2.2 1.4.1, 1.4.3, 2.5.8, 3.3.1, 3.3.2; SUS ≥ 70) | `public/css/app.css`, labelled fields, `aria-invalid` + described-by errors, icon + text badges | `contrast.test.js` (every text pair ≥ 4.5:1 and UI boundary ≥ 3:1, light and dark); `frontend.test.js` (text labels, distinct icon shapes, target sizes) | Screen audit with DevTools / contrast checker; 5-volunteer SUS session |
| R10 | Manual retrieval via searchable table, 10/10 by name and by ID | `GET /api/materials?q=`, `views/inventory.js`, manual entry on the Scan page | `R10` searches each sample by name, printed ID and QR payload text | — |
| R11 | Only authenticated users with the right role can modify | `server/auth/access.js` (`PERMISSIONS` matrix, access log) | `R11` makes 10 unauthorized attempts (no login, read-only, member) and checks all are rejected, all 10 are logged, and no data changes | — |
| R12 | Dashboard with stock status, expiry status and usage history | `GET /api/dashboard`, `views/dashboard.js` | `R12` checks dashboard counts against the DB and that all 20 transactions show in the paginated history | Compare the dashboard to the inventory table on screen |

## Manual test script (demonstration)

1. `npm run seed -- --force` then `npm start`. Log in as **manager** / `manager123`.
2. Open **Labels** → **Print labels** and print the 10 sample labels.
3. On a phone on the same Wi-Fi, open the `https://<computer-ip>:3443` address the server
   printed and accept the self-signed certificate warning. Log in as **member** / `member123`.
4. **Scan** each label. The material page shows "Retrieved in N ms" (R1, R7).
5. **Log usage** with valid and invalid amounts (R2, R8). Watch the stock badge change (R4).
6. Cover part of a label, or switch the camera off, and use the manual ID box or the inventory
   table instead (R10).
7. Log in as **viewer** / `viewer123` and confirm there are no edit or usage controls. Then, as
   **manager**, open **Activity log** and filter by *Denied* (R11).
8. SUS session (R9): run the 5-volunteer simulated-task session described in §3.1 and compute the
   mean SUS score.
