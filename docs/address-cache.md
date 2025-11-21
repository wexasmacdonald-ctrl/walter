# Address Cache

The route planner now stores previously geocoded coordinates so repeated runs
don’t keep hitting Mapbox (and so manual pin tweaks persist). Cached locations
live in a new Supabase table named `address_cache`.

## Table schema

```sql
create table if not exists public.address_cache (
  normalized_address text primary key,
  address_text text not null,
  lat double precision not null,
  lng double precision not null,
  source text not null default 'mapbox',
  updated_at timestamp with time zone default now()
);
```

`normalized_address` is just the trimmed, lower‑cased address with whitespace
collapsed; this lets different formatting of the same address reuse the same
row. `source` is either `mapbox` (auto‑geocoded) or `manual` (adjusted by an
admin on the map).

## How it works

- `/admin/driver-stops` and `/geocode` first look up cached coordinates for
  every address. Any missing addresses are sent to Mapbox, then persisted to the
  cache with `source = 'mapbox'`.
- When an admin drags a pin to a new spot, the worker writes the new coordinates
  back to both `driver_stops` and `address_cache` with `source = 'manual'`.
- Admins can clear entries via the new “Forget cache” action (bulk or single
  stop). The backend simply deletes the corresponding rows so the next geocode
  run hits Mapbox again.

## API reference

| Endpoint | Description |
| --- | --- |
| `POST /admin/driver-stops/:stopId/location` | Update a stop’s lat/lng and cache the manual coordinate. |
| `POST /admin/address-cache/forget` | Remove cached rows for the provided addresses. Body accepts `{ "addresses": [...] }` or the same newline formats used elsewhere. |

Both routes require an admin token (same as the rest of the admin API). Make
sure `address_cache` exists in Supabase before deploying; the worker assumes it
is available.***
