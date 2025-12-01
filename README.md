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

> Note: the legacy `worker/` directory now just re-exports the same worker to keep older scripts happy. Make all changes under `walter/worker/` so the deployed code and any local copies stay in sync.

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
| POST   | /account/team-access-code | Authenticated users submit a workspace invite code to join a company workspace (and unlock unlimited usage). |
| GET    | /workspace/invites | Admin only. Lists invite codes for the active workspace. |
| POST   | /workspace/invites | Admin only. Creates a new workspace invite code (optional limits/expiry). |
| GET    | /dev/workspaces | Dev-only. Lists every workspace so developers can switch between companies. |
| POST   | /dev/workspaces | Dev-only. Creates a new workspace plus a starter invite code. |
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

### Plans & usage limits

- **Free tier** – self-service registrations start here and can geocode up to **30 new stops per rolling 24-hour window** until they join a company workspace. When the limit is reached the worker returns `FREE_TIER_LIMIT_REACHED` along with `limit`, `used`, and `resetsAt` metadata so clients can show a friendly banner.
- **Business tier** – unlimited geocoding for any account that belongs to a workspace. Admin-created users inherit their workspace automatically, and dispatchers can generate invite codes (Settings → Workspace invites) for drivers to join later.

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

## Deployment (worker)

- Deploy from `walter/worker/` with `wrangler deploy`; `walter/worker/wrangler.toml` is the single config (name/account/date).
- The `worker/` folder is a legacy copy; code is synced, but do not deploy from there to avoid mismatched configs.
- Keep secrets in env files only (e.g., `.env.local`, `.dev.vars`), which are gitignored.

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
- features/admin/AdminDriverManager.tsx - Admin view for managing stop lists.
- features/driver/DriverStopsPanel.tsx - Driver view that syncs assigned stops.
- features/auth/LoginScreen.tsx - Sign-in view shown before accessing the planner.
- features/auth/AdminCreateUserCard.tsx - Admin-only account creation flow.
- features/auth/ChangePasswordCard.tsx - Self-service password update.
- features/route-planner/PinsForm.tsx - Geocode form that calls the worker (admin only).
- features/route-planner/MapScreen.* - Map preview components shared by admin/driver flows.
- worker/src/index.ts - Cloudflare worker deployed with Wrangler.

## Account Roles & Safety Controls

- **Roles**: Drivers only see their stops; admins manage a single workspace; devs inherit admin powers plus can impersonate users and override the active workspace via headers or the in-app directory.
- **Status checks**: Supabase `status` fields (`active`, `dev-active`, etc.) gate authentication so suspended users cannot sign in, even if their password is correct.
- **Workspace separation**: Drivers start on the free tier until an admin assigns them. Workspace deletion triggers a single backend cascade that releases users back to the free tier, clears invites, and deletes workspace rows so tenants remain isolated.
- **Dangerous actions require re-auth**: The Settings menu verifies the current password before deleting an account, and destructive backend endpoints re-check tokens/roles via `requireAuth`.
- **Usage throttles**: Free-tier accounts hit a 30-address rolling window enforced inside the worker; responses include `limit`, `used`, and `resetsAt` so the client can show a helpful banner.

## Developer Ops Toolkit

- **Workspace directory** (`features/admin/DevWorkspaceDirectory.tsx`) lets devs list, create, open, and delete workspaces, plus move drivers between tenants or the free tier.
- **Impersonation** (`DevImpersonationPanel`) stores the base dev session so you can become any user temporarily and then revert without signing out.
- **Driver assignment panel** exposes quick actions for attaching/detaching drivers during QA without needing invite codes.
- These tools are hidden for non-dev roles; the worker still enforces role checks on every `/dev/*` endpoint.

## Billing & Stripe

- `POST /billing/checkout` creates a Stripe Checkout session using the secret key and price IDs defined in `.env` (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_SMALL`, etc.). Metadata records the requesting user, target workspace, and requested driver count.
- Webhooks are verified with `STRIPE_WEBHOOK_SECRET` before updating Supabase’s `subscription_access`/`org_billing` tables, which drive the in-app billing status badge.
- The Settings menu exposes a “Test Stripe Checkout” button that simply calls the worker endpoint and opens the returned URL, so no Stripe logic lives in the Expo bundle.
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
  business_tier text not null default 'free' check (business_tier in ('free', 'business')),
  business_name text,
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

create table public.address_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  address_count integer not null,
  created_at timestamptz not null default now()
);

create index address_usage_events_user_id_created_at_idx
  on public.address_usage_events (user_id, created_at);
```

> Already live? Add the business_tier + business_name columns to public.users and create the public.address_usage_events table so the worker can enforce the free-tier limiter.

Admins manage each driver’s list through the Expo app; whenever they save, the worker deletes the driver’s existing rows, geocodes the new newline list, and inserts the refreshed coordinates.



