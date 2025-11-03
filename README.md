# Blow Pins App

This project turns newline-delimited addresses into map pins so drivers can see every stop on a map. No routing or batching is performed—only geocoding plus GPS display.

It contains two pieces:

1. **Expo front end** – textarea form + map preview (native) / info banner (web).
2. **Cloudflare Worker** (walter/worker/src/index.ts) – proxies Mapbox Search v6 to geocode up to 150 addresses per request and returns { pins: [...] }.

---

## Front End Quick Start

`ash
npm install
npx expo start
`

What you get:

- **Geocode form** – paste newline-delimited addresses, hit “Geocode”, and the worker responds with pins.
- **Map preview** – native builds render the pins with eact-native-maps plus the device’s GPS location; the web build shows guidance and counts.

API_BASE lives in eatures/route-planner/api.ts and points at the Cloudflare worker (default: https://blow-api.wexasmacdonald.workers.dev).

---

## Worker Overview

File: walter/worker/src/index.ts

Only one secret is required:

- MAPBOX_ACCESS_TOKEN – Mapbox Search v6 token with batch geocoding access.

Endpoints:

| Method | Path        | Description                                                                             |
|--------|-------------|-----------------------------------------------------------------------------------------|
| GET    | /health   | Returns { ok: true }.                                                                 |
| POST   | /geocode  | Normalizes input, geocodes via Mapbox, returns { pins: [...] }.                       |
| POST   | /optimize | Alias of /geocode so the legacy client keeps working.                                |
| OPTIONS| *         | CORS preflight handled automatically.                                                  |

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
- Enforces Mapbox’s batch limit of 1,000 (TOO_MANY_ADDRESSES_FOR_BATCH).

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

`ash
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

`ash
curl https://blow-api.wexasmacdonald.workers.dev/health
`

Geocode test:

`ash
curl -X POST https://blow-api.wexasmacdonald.workers.dev/geocode \
  -H "Content-Type: application/json" \
  --data '{ "addresses": [
    "1600 Pennsylvania Ave NW, Washington, DC",
    "Lincoln Memorial, Washington, DC"
  ] }'
`

---

## Common Failure Cases

- **HTTP 404** – request path was not /geocode, /optimize, or /health.
- **INVALID_INPUT** – no usable addresses after trimming.
- **MAPBOX_GEOCODE_FAILED** – Mapbox rejected or could not locate one or more addresses; see ailed array in the response.
- **TOO_MANY_ADDRESSES** – more than 150 addresses were submitted.

---

## Files of Interest

- pp/index.tsx – Expo entry point (form + map preview).
- eatures/route-planner/PinsForm.tsx – textarea form, fetches /geocode.
- eatures/route-planner/MapScreen.* – map preview components.
- walter/worker/src/index.ts – Cloudflare worker that calls Mapbox and returns pins.
