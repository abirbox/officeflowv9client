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
