# Blow Pins App

This project turns newline-delimited addresses into map pins so drivers can see every stop on a map. No routing or batching is performed - only geocoding plus GPS display.

It contains two pieces:

1. **Expo front end** - login screen, admin tools (create users + driver assignments), and the planner UI for admins and drivers (Expo native + web).
2. **Cloudflare Worker** (walter/worker/src/index.ts) - handles auth, driver management, and Mapbox geocoding for up to 150 addresses per request.

---

## Front End Quick Start

`bash
npm install
npx expo start
`

What you get:

- **Geocode form** - paste newline-delimited addresses, hit "Geocode", and the worker responds with pins.
- **Map preview** - native builds render the pins with react-native-maps plus the device's GPS location; the web build shows guidance and counts.

### Google Maps keys (native)

If the iOS/Android map shows a beige screen, the native Google tiles are missing API keys. Follow `docs/maps-sdk-setup.md` to enable the Maps SDKs, create platform-specific keys, and load them via `GOOGLE_MAPS_IOS_KEY` / `GOOGLE_MAPS_ANDROID_KEY`.

API_BASE lives in features/route-planner/api.ts and points at the Cloudflare worker (default: https://blow-api.wexasmacdonald.workers.dev).

---

## Worker Overview

File: walter/worker/src/index.ts

Secrets required:

- MAPBOX_ACCESS_TOKEN - Mapbox Search v6 token with batch geocoding access.
- SUPABASE_URL - Supabase project URL (https://YOUR-PROJECT.supabase.co).
- SUPABASE_SERVICE_KEY - Supabase service role key for admin API access.
- JWT_SIGNING_KEY - HMAC secret used to sign session tokens.
- (Optional) CORS_ORIGINS - Comma-separated list of Origins to allow (use * for any).

Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST   | /auth/login | Exchange identifier/password for a JWT session token. |
| POST   | /admin/create-user | Admin only. Creates a user and returns a temporary password. |
| GET    | /admin/drivers | Admin only. Lists driver accounts (id, name, email/phone). |
| GET    | /admin/driver-stops | Admin only. Returns the current stops for a driver (`driver_id` query). |
| POST   | /admin/driver-stops | Admin only. Replaces a driver’s stops; geocodes every address from scratch. |
| POST   | /auth/change-password | Authenticated users can update their password. |
| GET    | /driver/stops | Drivers (or admins with `driver_id`) fetch the assigned list. |
| POST   | /driver/stops/:id/complete | Drivers mark a stop complete. |
| POST   | /driver/stops/:id/undo | Drivers undo a completion (status returns to `pending`). |
| POST   | /geocode | Authenticated users geocode ad-hoc addresses via Mapbox Search v6. |
| GET    | /health | Returns { ok: true }. |
| OPTIONS| * | CORS preflight handled automatically. |

### Input shape

`json
{
  "addresses": [
    "123 Main St, City, ST",
    "456 Pine Ave, Town, ST"
  ]
}
`

...or a newline string:

`json
{
  "addresses": "123 Main St, City, ST\n456 Pine Ave, Town, ST"
}
`

Legacy keys (stops, input, etc.) are still accepted but always normalized to a trimmed array.

### Mapbox calls

- 1 address ? GET https://api.mapbox.com/search/geocode/v6/forward?q=...&access_token=...
- >1 address ? POST https://api.mapbox.com/search/geocode/v6/batch?access_token=... with body [{ "q": "addr" }, ...]

If Mapbox returns a non-200 or omits coordinates, the worker responds with MAPBOX_GEOCODE_FAILED, listing every failed address plus the upstream status/body snippet.

### Limits

- Rejects empty input (INVALID_INPUT).
- Caps at 150 addresses per request (TOO_MANY_ADDRESSES).
- Enforces Mapbox's batch limit of 1,000 (TOO_MANY_ADDRESSES_FOR_BATCH).

Returned payload:

`json
{
  "pins": [
    { "id": "1", "address": "123 Main St", "lat": 38.8977, "lng": -77.0365 },
    { "id": "2", "address": "456 Pine Ave", "lat": 38.8893, "lng": -77.0502 }
  ]
}
`

---

## Deploying the Worker

From walter/worker:

`bash
npm install   # only if dependencies changed
npx wrangler deploy
`

Successful deploy shows:

`
https://blow-api.wexasmacdonald.workers.dev
Current Version ID: 32254276-0838-4c57-aa39-4cce1753e12e
`

### Manual verification

Health check:

`bash
curl https://blow-api.wexasmacdonald.workers.dev/health
`

Login test:

`bash
curl -X POST https://blow-api.wexasmacdonald.workers.dev/auth/login \
  -H "Content-Type: application/json" \
  --data '{ "identifier": "admin@example.com", "password": "REPLACE_ME" }'
`

Geocode test:

`bash
curl -X POST https://blow-api.wexasmacdonald.workers.dev/geocode \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --data '{ "addresses": [
    "1600 Pennsylvania Ave NW, Washington, DC",
    "Lincoln Memorial, Washington, DC"
  ] }'
`

Driver stops test (replace DRIVER_ID and TOKEN):

`bash
curl -X POST https://blow-api.wexasmacdonald.workers.dev/admin/driver-stops \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  --data '{ "driver_id": "DRIVER_ID", "addresses": [
    "123 Main St, City, ST",
    "456 Pine Ave, Town, ST"
  ] }'
`

---

## Common Failure Cases

- **UNAUTHORIZED / TOKEN_EXPIRED** - Missing or invalid bearer token. Sign in and retry.
- **HTTP 404** - Request path was not a known endpoint.
- **INVALID_INPUT** - No usable addresses after trimming.
- **MAPBOX_GEOCODE_FAILED** - Mapbox rejected or could not locate one or more addresses; see failed array in the response.
- **TOO_MANY_ADDRESSES** - More than 150 addresses were submitted.

---

## Files of Interest

- app/index.tsx - Auth gate plus planner UI.
- features/admin/AdminDriverManager.tsx - Admin view for assigning driver stops.
- features/driver/DriverStopsPanel.tsx - Driver view that syncs assigned stops.
- features/auth/LoginScreen.tsx - Sign-in view shown before accessing the planner.
- features/auth/AdminCreateUserCard.tsx - Admin-only employee creation flow.
- features/auth/ChangePasswordCard.tsx - Self-service password update.
- features/route-planner/PinsForm.tsx - Geocode form that calls the worker (admin only).
- features/route-planner/MapScreen.* - Map preview components shared by admin/driver flows.
- worker/src/index.ts - Cloudflare worker deployed with Wrangler.
### Database tables

Seed the required tables in Supabase:

```sql
create table public.users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email_or_phone text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'driver')),
  status text not null default 'active',
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.driver_stops (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users(id) on delete cascade,
  address_text text not null,
  lat double precision,
  lng double precision,
  sort_order integer,
  status text not null default 'pending' check (status in ('pending', 'complete')),
  created_at timestamptz not null default now()
);

create index driver_stops_driver_id_sort_order_idx
  on public.driver_stops (driver_id, sort_order);
```

Admins manage each driver’s list through the Expo app; whenever they save, the worker deletes the driver’s existing rows, geocodes the new newline list, and inserts the refreshed coordinates.
