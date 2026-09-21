# TransitSync AI

TransitSync AI turns a real RFID boarding event into provisional academic attendance only after the bus reaches a verified campus geofence. One mixed bus manifest is split into the correct department, year, section, and timetable session for faculty review.

## Architecture

- `frontend/` — React, TypeScript, Tailwind CSS, Three.js, GSAP, Framer Motion, Recharts, Socket.IO
- `backend/` — Express, TypeScript, PostgreSQL/Neon, JWT RBAC, Socket.IO, OpenRouter
- No microSD dependency — device retries use a bounded in-memory queue in firmware; the server is idempotent and safely accepts retransmissions.
- AI never marks attendance. OpenRouter only explains trends computed from verified database records.

## Local start

1. Create a Neon database and copy its pooled connection string.
2. Copy `backend/.env.example` to `backend/.env` and fill the values.
3. Copy `frontend/.env.example` to `frontend/.env`.
4. This repository uses pnpm. From the project root run:

```bash
pnpm install
pnpm dev
```

If pnpm is not installed, run `npm install -g pnpm@11.19.0` once.

The API runs locally on `http://localhost:8081` and applies the idempotent SQL schema automatically on startup. Open `http://localhost:5173`, choose **Initialize workspace**, and create the first administrator. This route disables itself permanently once the first account exists.

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

GPS packets use `type: "GPS"` plus numeric `latitude` and `longitude`. The backend performs dwell-aware Haversine geofencing, creates provisional attendance after arrival, and broadcasts every accepted event to connected dashboards.

## Deployment

### Vercel frontend

- Import this repository in Vercel.
- Set Root Directory to `frontend`.
- Set `VITE_API_URL=https://<your-railway-api-domain>`.

### Railway backend

- Create a service from this repository.
- Set Root Directory to `backend`.
- Add the variables from `backend/.env.example`, using the Neon pooled `DATABASE_URL`.
- Generate a public domain and place that origin in `CORS_ORIGINS`.
- Set the same Railway URL as `OPENROUTER_SITE_URL`.

Railway uses the included `Dockerfile` and `/health` endpoint. Vercel uses `frontend/vercel.json` for SPA routing and security headers.

## Security model

- Short-lived JWT bearer sessions with role-based authorization.
- Device secrets and user passwords are stored only as hashes.
- Ingestion is idempotent by device event ID.
- Raw device evidence is append-only through the API; faculty changes derived attendance with an audit trail.
- OpenRouter receives aggregate statistics, not student names, RFID UIDs, parent contacts, or raw GPS coordinates.
