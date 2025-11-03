type Env = {
  MAPBOX_ACCESS_TOKEN?: string;
};

type Pin = {
  id: string;
  address: string;
  lat: number;
  lng: number;
};

type NormalizeResult =
  | { type: 'ok'; addresses: string[] }
  | { type: 'error'; response: Response };

type GeocodeSuccess = {
  address: string;
  lat: number;
  lng: number;
};

type GeocodeFailure = {
  address: string;
  message: string;
};

type GeocodeResult =
  | { type: 'ok'; stops: GeocodeSuccess[] }
  | { type: 'error'; response: Response };

const MAX_ADDRESSES = 150;
const MAPBOX_BATCH_LIMIT = 1000;
const MAPBOX_FORWARD_ENDPOINT =
  'https://api.mapbox.com/search/geocode/v6/forward?limit=1';
const MAPBOX_BATCH_ENDPOINT =
  'https://api.mapbox.com/search/geocode/v6/batch';

const BASE_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...BASE_HEADERS,
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
      });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true });
    }

    if (
      request.method !== 'POST' ||
      (url.pathname !== '/geocode' && url.pathname !== '/optimize')
    ) {
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }

    if (!env.MAPBOX_ACCESS_TOKEN) {
      return jsonResponse(
        {
          error: 'CONFIG_ERROR',
          message: 'MAPBOX_ACCESS_TOKEN is not configured.',
        },
        500
      );
    }

    const normalizeResult = await normalizeAddresses(request);
    if (normalizeResult.type === 'error') {
      return normalizeResult.response;
    }

    const addresses = normalizeResult.addresses;

    if (addresses.length === 0) {
      return jsonResponse(
        { error: 'INVALID_INPUT', message: 'Provide at least one address.' },
        400
      );
    }

    if (addresses.length > MAX_ADDRESSES) {
      return jsonResponse(
        {
          error: 'TOO_MANY_ADDRESSES',
          message: `Limit is ${MAX_ADDRESSES} addresses per request.`,
        },
        400
      );
    }

    if (addresses.length > MAPBOX_BATCH_LIMIT) {
      return jsonResponse(
        {
          error: 'TOO_MANY_ADDRESSES_FOR_BATCH',
          message: `Mapbox batch geocoding accepts up to ${MAPBOX_BATCH_LIMIT} addresses.`,
        },
        400
      );
    }

    const geocodeResult = await geocodeAddresses(
      addresses,
      env.MAPBOX_ACCESS_TOKEN
    );
    if (geocodeResult.type === 'error') {
      return geocodeResult.response;
    }

    const pins: Pin[] = geocodeResult.stops.map((stop, index) => ({
      id: String(index + 1),
      address: stop.address,
      lat: stop.lat,
      lng: stop.lng,
    }));

    return jsonResponse({ pins });
  },
};

async function normalizeAddresses(request: Request): Promise<NormalizeResult> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return {
      type: 'error',
      response: jsonResponse({ error: 'INVALID_JSON' }, 400),
    };
  }

  const input =
    (payload as any)?.addresses ??
    (payload as any)?.stops ??
    (payload as any)?.input ??
    (payload as any)?.Addresses ??
    (payload as any)?.Stops ??
    (payload as any)?.Input ??
    payload;

  if (typeof input === 'string') {
    const addresses = input
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    return { type: 'ok', addresses };
  }

  if (Array.isArray(input)) {
    const addresses = input
      .flatMap((value) => (typeof value === 'string' ? value.split(/\r?\n/) : []))
      .map((value) => value.trim())
      .filter(Boolean);
    return { type: 'ok', addresses };
  }

  return {
    type: 'error',
    response: jsonResponse(
      {
        error: 'INVALID_INPUT',
        message: 'Expected addresses as array or newline string.',
      },
      400
    ),
  };
}

async function geocodeAddresses(
  addresses: string[],
  token: string
): Promise<GeocodeResult> {
  if (addresses.length === 1) {
    return geocodeSingle(addresses[0], token);
  }

  return geocodeBatch(addresses, token);
}

async function geocodeSingle(
  address: string,
  token: string
): Promise<GeocodeResult> {
  const url = new URL(MAPBOX_FORWARD_ENDPOINT);
  url.searchParams.set('q', address);
  url.searchParams.set('access_token', token);

  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  const text = await response.text();
  const snippet = createBodySnippet(text);

  if (!response.ok) {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: snippet,
          failed: [
            { address, message: 'Mapbox forward geocode request failed.' },
          ],
          success: [],
        },
        response.status >= 400 ? response.status : 502
      ),
    };
  }

  let payload: any;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: snippet,
          failed: [
            { address, message: 'Mapbox response was not valid JSON.' },
          ],
          success: [],
        },
        502
      ),
    };
  }

  const coords = findCoordinates(payload?.features?.[0]);
  if (!coords) {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: snippet,
          failed: [
            { address, message: 'Mapbox did not return coordinates.' },
          ],
          success: [],
        },
        422
      ),
    };
  }

  return {
    type: 'ok',
    stops: [{ address, lat: coords.lat, lng: coords.lng }],
  };
}

async function geocodeBatch(
  addresses: string[],
  token: string
): Promise<GeocodeResult> {
  const response = await fetch(
    `${MAPBOX_BATCH_ENDPOINT}?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addresses.map((address) => ({ q: address }))),
    }
  );

  const text = await response.text();
  const snippet = createBodySnippet(text);

  if (!response.ok) {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: snippet,
          failed: addresses.map((address) => ({
            address,
            message: 'Mapbox batch geocode request failed.',
          })),
          success: [],
        },
        response.status >= 400 ? response.status : 502
      ),
    };
  }

  let payload: any;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: snippet,
          failed: addresses.map((address) => ({
            address,
            message: 'Mapbox batch response was not valid JSON.',
          })),
          success: [],
        },
        502
      ),
    };
  }

  const results: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.batch)
    ? payload.batch
    : [];

  const successes: GeocodeSuccess[] = [];
  const failures: GeocodeFailure[] = [];

  addresses.forEach((address, index) => {
    const entry = results[index];
    const coords = findCoordinates(entry?.features?.[0] ?? entry);
    if (!coords) {
      failures.push({
        address,
        message: 'Mapbox did not return coordinates for this address.',
      });
    } else {
      successes.push({ address, lat: coords.lat, lng: coords.lng });
    }
  });

  if (failures.length > 0) {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: snippet,
          failed: failures,
          success: successes,
        },
        422
      ),
    };
  }

  return { type: 'ok', stops: successes };
}

function findCoordinates(entry: any): { lat: number; lng: number } | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const coords = entry?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { lat, lng };
    }
  }

  const latLng = entry?.properties?.coordinates ?? entry?.latLng;
  if (
    latLng &&
    typeof latLng.latitude === 'number' &&
    typeof latLng.longitude === 'number'
  ) {
    return { lat: latLng.latitude, lng: latLng.longitude };
  }

  if (typeof entry.lat === 'number' && typeof entry.lng === 'number') {
    return { lat: entry.lat, lng: entry.lng };
  }

  if (typeof entry.lat === 'number' && typeof entry.lon === 'number') {
    return { lat: entry.lat, lng: entry.lon };
  }

  return null;
}

function createBodySnippet(source: string | null | undefined, maxLength = 400) {
  if (!source) {
    return undefined;
  }
  return source.length > maxLength ? `${source.slice(0, maxLength)}...` : source;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: BASE_HEADERS,
  });
}
