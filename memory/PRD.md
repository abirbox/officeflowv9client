# OfficeFlowV3 Preview Record

## Original problem statement
Load this git and show preview https://github.com/Marketexpert3/OfficeflowV3.git

## Architecture decisions
- Cloned the repository's default branch into `/app/OfficeflowV3`.
- Preserved tracked application source unchanged.
- Installed the frontend's declared dependencies and started its existing CRA/CRACO development server on port 3001.
- Used the repository's existing same-origin `/api` routing behavior for the preview.

## User personas
- OfficeFlow administrator or employee reviewing the existing ERP interface.

## Core requirements
- Use the default branch.
- Run the existing project exactly as provided.
- Show a working preview of the existing interface.

## What's been implemented
- 2026-08-23: Cloned the default branch from the requested GitHub repository.
- 2026-08-23: Installed frontend dependencies with Yarn without changing tracked source files.
- 2026-08-23: Started the unchanged frontend preview on port 3001.
- 2026-08-23: Verified `/login` renders the OfficeFlow welcome screen, fields, and sign-in control.
- 2026-08-23: Reassigned the externally mapped frontend port 3000 to this checkout and verified `https://officeflow-v3.preview.emergentagent.com/login` shows the requested OfficeFlow interface.
- 2026-08-23: Connected the external `/api` ingress to the OfficeFlowV3 backend, added the development API proxy, and configured a generated runtime JWT secret.
- 2026-08-23: Verified super admin login reaches `/dashboard` with the supplied credentials.

## Known limitations
- Dispatch WebSocket initialization logs a non-blocking early-close warning; core dashboard and authentication flows remain functional.

## Prioritized backlog
- P0: Keep the OfficeFlowV3 backend, generated JWT runtime secret, and `/api` ingress routing active for authenticated preview access.
- P1: Verify authenticated dashboard workflows against the imported backend.
- P2: Improve dispatch WebSocket retry behavior if realtime dispatch is required.

## Next tasks
- Review the authenticated dashboard at `https://officeflow-v3.preview.emergentagent.com/dashboard`.
- Investigate dispatch WebSocket retry behavior if realtime updates are needed.
## Update 2026-02 Session
- Removed session timeout: JWT exp = 10 years, cookie max_age = 315360000. Persistent JWT_SECRET moved to /app/OfficeflowV3/backend/.env so tokens survive backend restarts.
- Dispatch Schedule Post Pin format: Fixed backend projection bug in routes/dispatch.py `_name()` — added `code: 1` to the field projection so vendor `code` is returned. Frontend already renders `[VENDOR_CODE] #POST_PIN`.
- Unique invoice index: Already present in server.py startup as `db.dispatch_invoices.create_index("invoice_number", unique=True)`. Verified enforcement at DB level (duplicate insert returns E11000).

## Update 2026-02 Session (cont'd)
- Vendor Code Everywhere: Added `post_pin_display` to /dispatch/schedules, /dispatch/reports/schedules, /dispatch/reports/by-post-site, /dispatch/reports/entity-detail. Frontend has shared `formatPin(row)` helper used by DispatchSchedulePage, DispatchCalendarPage (WeekGrid/DayList/DetailDialog) and DispatchReportsPage. Report CSV/PDF exports and payslip PDF switched to `post_pin_display`. Invoice PDF's Location cell now renders `VENDOR # PIN` (bold, first line) then the location text underneath.
- Bulk CSV Import: New endpoints `GET /api/dispatch/schedules/import-template` and `POST /api/dispatch/schedules/import` (multipart CSV). Frontend has an "Import CSV" button on the Dispatch Schedule toolbar and a dialog with column instructions, template download, file picker, and a per-row error report. CSV falls back to `client_name`/`vendor_name` (or codes) when the post site lacks these.

## Update 2026-02 Session (cont'd 2)
- Made `work_order_number` optional on `ScheduleCreate`, in the create-schedule form ("Work Order Number" no longer marked required), and in the CSV import path.
- CSV import: added `?dry_run=true` query param — validates every row but persists nothing. Response shape unchanged (`created_ids` empty).
- CSV import: rows that duplicate an existing shift (same officer + date + start_time) now soft-skip via a `skipped: [{row, reason}]` list rather than fail as errors. Frontend Import CSV dialog gained a "Preview" button and displays separate Ready/Skipped/Errors badges + tables.

## Update 2026-02 Session (cont'd 3)
- All CSV export buttons switched to Excel (.xlsx):
  - Added `openpyxl` to backend requirements; new `build_xlsx()` helper in `utils/dispatch_reports.py` renders styled workbooks (indigo header, banded rows, red-bold post pin, currency-aware widths, frozen header).
  - Backend endpoints `/dispatch/reports/export` and `/dispatch/reports/export/entity-detail` now accept `format=xlsx`.
  - Frontend `DispatchReportsPage` "Export CSV" → "Export Excel" (and entity-detail column picker CSV → Excel).
  - Added `exceljs` npm package. `DispatchSchedulePage` now generates a styled .xlsx client-side that mirrors the on-screen table (pink header FBC9FF, tinted Date column, red-bold post pin, green city cells).
  - `ReportsPage` (attendance/payroll/overtime) `csvDownload` helper replaced with `excelDownload` — indigo header, banded rows.

## Update 2026-02 Session (cont'd 4)
- Shift statuses reduced to exactly three: **Not Started · Clocked In · Clocked Out**.
- Introduced `COMPLETED_STATUSES = ["Clocked In", "Clocked Out"]`. Reports, aggregations, invoices and payslip computations now count both — so once an officer is Clocked In, the shift is treated as complete.
- Startup `LEGACY_STATUS_MAP` migrates old values: `Complete/Completed → Clocked Out`; `Late Clocked In → Clocked In`; `Late Clocked Out / Early Clocked Out → Clocked Out`; `Cancelled/Absent → Not Started`. Verified: `Complete → Clocked Out` on 1 record.
- Removed Cancel button from row menu; the legacy `/schedules/{sid}/cancel` endpoint now hard-deletes (backwards-compatible).
- DispatchDashboardPage stat cards: replaced Late/Absent with Clocked In / Clocked Out counts.
- DispatchReportsPage: removed Absent/Late/Early Out/Cancelled columns from By-Officer / By-Client / By-Vendor / By-Post-Site (they would always be 0 now). Copy updated to "Paid hours = shifts once Clocked In".
