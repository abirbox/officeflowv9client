# OfficeFlowV5 — Local/Preview Run PRD

## Original Problem Statement
Clone https://github.com/gbl-bd/officeflowv5.git and get it running in a browser
preview WITHOUT modifying application source code. Only recreate missing config
(`.env`) and provide a database. React (CRA + CRACO + Tailwind/shadcn) frontend +
FastAPI backend + MongoDB.

## User Choices
- MongoDB: local instance in this environment.
- Run here on managed supervisor ports (3000 frontend / 8001 backend) for a live preview URL.
- If a code edit were strictly required to run, make a minimal fix and flag it.
- Create a seed/test account for login.

## Architecture
- Frontend: CRA via CRACO, Tailwind + shadcn, react-router-dom v7, zustand auth store.
  Browser calls use relative `/api` (same-origin via ingress) — CORS-free.
- Backend: FastAPI, motor/MongoDB, JWT (cookie `access_token`/`refresh_token`), bcrypt.
  All routes under `/api`. Admin auto-seeded on empty users collection.
- DB: local MongoDB `mongodb://localhost:27017`, db `test_database`.

## Config Recreated (no source code changed)
- `backend/.env`: MONGO_URL, DB_NAME, CORS_ORIGINS, JWT_SECRET (required, was missing),
  FRONTEND_URL, ADMIN_EMAIL, ADMIN_PASSWORD.
- `frontend/.env`: REACT_APP_BACKEND_URL (preview URL), WDS_SOCKET_PORT, ENABLE_HEALTH_CHECK.
- Required env keys discovered in source: MONGO_URL, DB_NAME, JWT_SECRET (required);
  optional: FRONTEND_URL, ADMIN_EMAIL, ADMIN_PASSWORD, STORAGE_ROOT, MAX_UPLOAD_BYTES,
  RESEND_API_KEY, SENDER_EMAIL.

## Status (2026-08-26)
- Repo copied into /app (backend + frontend), `.env` preserved for this environment.
- pip install + yarn install done; supervisor backend+frontend RUNNING.
- Verified: /api/health, /api/ (root), admin login, cookie session, /api/auth/me,
  /api/employees. Browser E2E: login -> /dashboard redirect, dashboard + Employees data,
  session persistence, invalid-credential error. 100% (6/6) frontend flows, no CORS/console errors.

## Auth / Seed
- Admin (auto-seeded): admin@example.com / admin123 (super_admin). See test_credentials.md.
- Public self-registration is disabled by design; new users created by admins.

## Report-Back Items (pre-existing app behavior — not modified)
- WebSocket `/api/ws/dispatch` fails to establish in preview (ingress does not forward
  WS upgrade on `/api`). Non-blocking: realtime dispatch updates won't push; pages render fine.
- Dashboard "Total Employees" = 0 while Employees list shows the super_admin — stats endpoint
  appears to exclude admin roles by design.

## Backlog / Next
- P1: Enable WebSocket forwarding for `/api/ws/dispatch` if realtime dispatch is needed.
- P2: Broader module testing (Shifts, Attendance, Live Map, Leaves, Payroll, Reports,
  Settings, Dispatch pages, Employee CRUD) — untested so far.

## Feature: Payment (SO) — added 2026-06 (this session)
- New Dispatch page "Payment (SO)" at /dashboard/dispatch/payment-so (nav gated by dispatch.officers.view).
- Main list: Security Officers (Client Name, SO Name, SO Code); row click opens per-officer report; "Add Payment" button per row.
- Add Payment: Date (manual), Payment Method (W2/W9/Zelle/Cash/Direct Bank Transfer/Others), Transaction ID, Amount.
- Report: transactions table (payslip style — pink header, pink date column), Total footer row, filters by date range + payment method, summary box (Client, Officer, Code, Statement Period, Total Balance, per-method balances), PDF + Excel export.
- Backend: routes/so_payments.py; collection dispatch_so_payments; PDF/Excel builders in utils/dispatch_reports.py (build_so_payment_report_pdf / _xlsx). Router registered in server.py.
- Verified: backend curl + frontend E2E (testing agent iteration_2.json) — 100% of 7 flows pass, no console errors.
- Seed for demo: client 'Arseas Security' (ARS), officer 'John Doe' (ARS297002) with sample payments.

## Feature: Payment (SO) redesign — client-based W2/W9 records (this session)
- Landing page now lists Clients (Client Name, Client Code, Security Officers count, View action).
- Client view: 'Add New Payment' + search bar + records table with columns SL, SO Name, Address, Social Security Code, W2, W9 Direct Deposit, W9 Zelle Transfer, W9 Total (DD+Zelle), Total (W2+W9); grand-totals footer; PDF + Excel export.
- Add/Edit Payment: searchable officer picker (name/code/email/phone/SSC) + 3 fixed rows (W2, W9 Direct Deposit, W9 Zelle Transfer) each with Date/Transaction ID/Amount; one record per officer (POST upserts); edit pre-fills.
- Security Officer: added Social Security Code field to Add/Edit form and as a list column.
- Backend: new collection dispatch_so_payment_records; endpoints under /api/so-payments (clients, officers/search, records CRUD/upsert, records/report pdf+xlsx). New builders build_client_payment_records_pdf/_xlsx. Officer model gained social_security_code.
- Verified: backend curl (record W9 Total 500 / Total 1500, PDF/XLSX 200) + frontend E2E (iteration_3.json) 100% pass, no blocking issues.

## Feature: Payment (SO) rev 3 — Officer Detail view + dated entries (this session)
- Payment records are now MULTIPLE dated entries per officer (POST creates; PUT edits by id). Transaction ID field removed from all 3 payment rows (Date + Amount only).
- Client view: aggregated per-officer rows (summed across entries); officer name/View opens Officer Detail.
- Officer Detail: table Date | W2 | W9 (grouped: Direct Deposit / Zelle Transfer / W9 Total) | Total (W2+W9), totals footer, add/edit/delete entry, PDF + Excel export.
- Officer export layout: header = client logo (left) + client name (right); left details Officer Name, Social Security Code, Transaction Period; grouped W9 table; grand totals row. Builders build_officer_payment_records_pdf/_xlsx.
- Added client-side guard: cannot save an entry with all amounts 0.
- Verified: backend curl (all endpoints + 4 exports 200) + frontend E2E iteration_4.json 100% (8/8), no functional defects.

## Feature: Payment (SO) rev 4 — grouped W9, date filters, statement PDFs (this session)
- Client table column order: SL, Officer Name, Address, Social Security, W2, W9 (grouped header: Direct Deposit / Zelle Transfer / W9 Total), Total (W2+W9), Action.
- Date Filter on both Client view and Officer detail: presets (All Time, Last 7/30 Days, Last 3/6 Months, Last 1 Year) + Custom manual range. Wired into list + report endpoints (date_from/date_to).
- Client Statement PDF: centered header (logo, name, address, email, phone, website); row with left title 'Security Officer Payment Records' + right Statement Period; grouped W9 table; grand totals.
- Officer Statement PDF: centered client header (logo, name, address, phone, email, website); left details Officer Name / Social Security Code / Statement Period; table Date, W2, grouped W9, Total; totals row.
- Backend: _client_context/_officer_context accept date_from/date_to; _client_public exposes full client contact+logo; _in_range helper. Builders: _client_center_header, rewritten build_client/officer_payment_records_pdf.
- Verified: backend curl + both PDFs visually confirmed + frontend E2E iteration_5.json 100% (5/5), no defects. Debounced custom-range fetches.

## Feature: Employee/Dispatch Portal split (this session)
- Two panels: Employee Portal (ERP/HR modules) and Dispatch Portal (dispatch modules). Users with dispatch permission get a post-login selection popup; others go straight to Employee Portal.
- Each portal shows ONLY its own modules + a 'Switch to <other> Portal' button (desktop + mobile). Switching is instant (no re-login), state persisted in localStorage ('officeflow_portal'), cleared on logout so popup reappears next login.
- Non-dispatch users are locked to Employee Portal (no popup, no switch, tampered localStorage cannot unlock dispatch nav). Switching to dispatch lands on the user's first permitted dispatch route.
- Files: stores/portalStore.js, layouts/DashboardLayout.js, lib/permissions.js (hasAnyDispatchPerm).
- Verified: frontend E2E iteration_6.json 100% (6/6). Test creds: admin@example.com/admin123 (dispatch), test.plain@officeflow.com/Test@123 (no dispatch).
