# TransitSync AI

TransitSync AI connects independent bus, classroom and hostel attendance with live transport operations. RFID creates pending evidence; server-side face verification completes boarding. Faculty starts classroom attendance during the timetable window and reviews the academic record. Students and parents see the same stored records.

See [Operations workflow and setup](docs/OPERATIONS.md) for route/seat configuration, camera enrollment, GPS, notifications, reports and acceptance checks.

See [Accounts and password recovery](docs/ACCOUNTS.md) for five-role sign-in, automatic registration and administrator-assisted reset links.

## Architecture

- `frontend/` — React, TypeScript, Tailwind CSS, Three.js, GSAP, Framer Motion, Recharts, Socket.IO
- `backend/` — Express, TypeScript, PostgreSQL/Neon, JWT RBAC, Socket.IO, OpenRouter
- No microSD dependency — device retries use a bounded in-memory queue in firmware; the server is idempotent and safely accepts retransmissions.
- AI never marks attendance. OpenRouter only explains trends computed from verified database records.

## Local start — same application as production

From an up-to-date clone of this repository:

```bash
git pull origin main
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:5173**. This runs the same React application, theme, animations, five role portals and role-based controls used in production. **Open control center** offers Admin, Transport, Faculty, Student and Parent. The local frontend connects to the existing Railway API and Neon database, so existing accounts, buses and attendance match the deployed site. No backend environment file or database credentials are needed for this mode.

**This mode uses live records:** registrations, attendance changes and other saved actions affect production. Sign in with an existing account's correct role. Browser sessions are separate between localhost and the deployed site, so sign in again locally.

The frontend proxies API requests, health checks and Socket.IO through localhost. This avoids local CORS differences and keeps real-time updates working. Older `VITE_API_URL=http://localhost:8081` settings do not override `pnpm dev`; use the explicit local mode below when you want a local API. If port 5173 is occupied, stop the older dev server: startup fails clearly instead of silently moving to another port and leaving you on an outdated application.

Direct local entries: **/admin**, **/transport**, **/faculty**, **/student**, **/parent**. These use the same entry pages and dashboards as production. Students and parents are also linked from the lower landing-page section.

If pnpm is not installed, run `npm install -g pnpm@11.19.0` once. Supported Node.js versions are 20 or later.

### Fully local frontend and backend

Use this mode for development against your own database:

1. Create a separate Neon/PostgreSQL development database.
2. Copy `backend/.env.example` to `backend/.env` and fill its database, JWT and campus settings.
3. Optionally copy `frontend/.env.example` to `frontend/.env`; `VITE_DEV_API_TARGET` defaults to `http://localhost:8081` and must match the backend port.
4. Run `pnpm dev:full` from the repository root.

Open **http://localhost:5173**. The local API runs at **http://localhost:8081** and applies the SQL schema on startup. A fresh database shows initial workspace setup first. Create the first Admin once; all five role login and registration options then become available. The UI/features are identical, but accounts and attendance come from your development database, so production records do not appear automatically.

`pnpm --dir frontend dev:local` runs only the frontend proxy against a local API you have already started. `VITE_LIVE_API_URL` optionally changes the remote target for the default live-connected mode; it is a public API origin, never a database connection string.

### Preview a production build locally

Run `pnpm build`, then `pnpm preview`, and open **http://localhost:4173**. Keep `VITE_API_URL` blank for this local build so requests use the live API proxy. Vercel still supplies its configured `VITE_API_URL` when building the deployed frontend.

## Student and parent portals

The public landing page links to separate **Student** (`/student`) and **Parent** (`/parent`) entry pages. Students can register immediately with their name, registration number, RFID UID, department, year, section, residency, and an existing bus (optional for hostel students). If a campus student record already exists, these details must match before the account can claim it. Parents register with only the child's registration number and the parent mobile number recorded on that student's active record; the parent's account name is not a matching field. Local and `+91` mobile formats are accepted. Parents can link another child from their dashboard using the same two fields. Administrators can also create linked accounts under **Accounts & access**. An administrator account remains in operations.

Both portals display the linked student's class timetable, assigned bus and route, RFID evidence, separate bus/class attendance, camera verification, GPS maps and journey notifications. A bus scan creates a pending face check; it does not mark academic attendance. Campus arrival updates the bus journey only. Faculty starts the separately scheduled class session and reviews its classroom evidence. Portal API queries are limited to linked students. Staff events remain on the operations socket channel; portals receive a data-change signal and reload their scoped view.

All roles read the same bus, trip, RFID, and attendance tables. Transport can start, confirm arrival, and complete trips; faculty sees the boarding manifest and reviews provisional attendance; students and parents see their linked journeys and records. Socket events refresh each screen immediately, with a 15-second polling fallback. Existing accounts and student records remain in place.

## Hardware ingestion

Create a bus in the dashboard. The API returns its device secret exactly once. The ESP32 sends HTTPS requests to `POST /api/device/events` with:

```http
X-Device-Key: <one-time bus device secret>
Content-Type: application/json
```

```json
{
  "busCode": "BUS-01",
  "eventId": "esp32-boot42-000019",
  "type": "RFID_SCAN",
  "rfidUid": "04A1B2C3D4",
  "deviceTimestamp": "2026-09-21T08:11:04.000Z"
}
```

GPS packets use `type: "GPS"` plus numeric `latitude` and `longitude`. The backend performs dwell-aware Haversine geofencing, updates verified bus arrivals, creates boarding-point alerts, and broadcasts accepted events to connected dashboards. It never creates class attendance from bus arrival.

## Deployment

### Vercel frontend

- Import this repository in Vercel with Root Directory set to the repository root (`.`). The root `vercel.json` builds the workspace and serves `frontend/dist` with SPA routing.
- Set `VITE_API_URL=https://<your-railway-api-domain>`.

### Railway backend

- Create a service from this repository.
- Set Root Directory to `backend`.
- Add the variables from `backend/.env.example`, using the Neon pooled `DATABASE_URL`.
- Generate a public domain and place that origin in `CORS_ORIGINS`.
- Set the same Railway URL as `OPENROUTER_SITE_URL`.

Railway uses the included `Dockerfile` and `/health` endpoint. Vercel uses the root `vercel.json` for SPA routing and security headers.

## Security model

- Short-lived JWT bearer sessions with role-based authorization.
- Device secrets and user passwords are stored only as hashes.
- Ingestion is idempotent by device event ID.
- Raw device evidence is append-only through the API; faculty changes derived attendance with an audit trail.
- OpenRouter receives aggregate statistics, not student names, RFID UIDs, parent contacts, or raw GPS coordinates.
