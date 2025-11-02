type Env = {
  MAPBOX_ACCESS_TOKEN?: string;
  GOOGLE_API_KEY?: string;
};

type GeocodeSuccess = {
  address: string;
  lat: number;
  lng: number;
};

type GeocodeFailure = {
  address: string;
  message: string;
  status?: number;
  bodySnippet?: string;
};

type MapboxGeocodeResult =
  | {
      ok: true;
      successes: GeocodeSuccess[];
      failures: [];
      status: number;
      bodySnippet?: string;
    }
  | {
      ok: false;
      successes: GeocodeSuccess[];
      failures: GeocodeFailure[];
      status: number;
      bodySnippet?: string;
    };

type OrderedStop = GeocodeSuccess & { order: number };

const MAX_ADDRESSES = 150;
const MAPBOX_BATCH_LIMIT = 100; // Mapbox batch endpoint limit
const GOOGLE_ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_OPTIMIZE_LIMIT = 25;

const baseHeaders: HeadersInit = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...baseHeaders,
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
        },
      });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true });
    }

    const isOptimize = request.method === 'POST' && url.pathname === '/optimize';
    const isGeocode = request.method === 'POST' && url.pathname === '/geocode';

    if (!isOptimize && !isGeocode) {
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }

    if (!env.MAPBOX_ACCESS_TOKEN) {
      return jsonResponse(
        { error: 'CONFIG_ERROR', message: 'MAPBOX_ACCESS_TOKEN is not configured.' },
        500
      );
    }

    if (isOptimize && !env.GOOGLE_API_KEY) {
      return jsonResponse(
        { error: 'CONFIG_ERROR', message: 'GOOGLE_API_KEY is not configured.' },
        500
      );
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'INVALID_JSON' }, 400);
    }

    const addresses = normalizeAddresses(
      payload?.addresses ?? payload?.stops ?? payload?.input ?? null
    );

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

    if (addresses.length > 1 && addresses.length > MAPBOX_BATCH_LIMIT) {
      return jsonResponse(
        {
          error: 'TOO_MANY_ADDRESSES_FOR_BATCH',
          message: `Mapbox batch geocoding accepts up to ${MAPBOX_BATCH_LIMIT} addresses.`,
        },
        400
      );
    }

    const mapboxResult = await geocodeWithMapbox(addresses, env.MAPBOX_ACCESS_TOKEN);

    if (!mapboxResult.ok) {
      return jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: mapboxResult.status,
          mapboxBody: mapboxResult.bodySnippet ?? null,
          failed: mapboxResult.failures,
          success: mapboxResult.successes,
        },
        mapboxResult.status >= 400 ? mapboxResult.status : 502
      );
    }

    if (!isOptimize) {
      return jsonResponse({
        success: mapboxResult.successes,
        failed: [],
      });
    }

    let orderedStops: OrderedStop[];
    try {
      orderedStops = await computeOptimizedRoute(mapboxResult.successes, env.GOOGLE_API_KEY!);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        {
          error: 'GOOGLE_ROUTES_FAILED',
          message,
        },
        502
      );
    }

    return jsonResponse({
      order: orderedStops.map((stop, index) => ({
        label: index + 1,
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
      })),
      warnings: [],
    });
  },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: baseHeaders,
  });
}

function normalizeAddresses(input: unknown): string[] {
  if (typeof input === 'string') {
    return input
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  if (Array.isArray(input)) {
    return input
      .flatMap((value) => (typeof value === 'string' ? value.split(/\r?\n/) : []))
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return [];
}

async function geocodeWithMapbox(
  addresses: string[],
  token: string
): Promise<MapboxGeocodeResult> {
  if (addresses.length === 1) {
    return geocodeSingleAddress(addresses[0], token);
  }
  return geocodeBatch(addresses, token);
}

async function geocodeSingleAddress(address: string, token: string): Promise<MapboxGeocodeResult> {
  const params = new URLSearchParams({
    q: address,
    limit: '1',
    access_token: token,
  });
  const url = `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`;

  const response = await fetch(url);
  const text = await response.text();
  const snippet = createBodySnippet(text);

  if (!response.ok) {
    return {
      ok: false,
      successes: [],
      failures: [
        {
          address,
          message: 'Mapbox forward geocode request failed.',
          status: response.status,
          bodySnippet: snippet,
        },
      ],
      status: response.status,
      bodySnippet: snippet,
    };
  }

  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return {
      ok: false,
      successes: [],
      failures: [
        {
          address,
          message: 'Mapbox response was not valid JSON.',
          status: response.status,
          bodySnippet: snippet,
        },
      ],
      status: response.status,
      bodySnippet: snippet,
    };
  }

  const coordinates = findCoordinates(parsed);
  if (!coordinates) {
    return {
      ok: false,
      successes: [],
      failures: [
        {
          address,
          message: 'Mapbox did not return coordinates.',
          status: response.status,
          bodySnippet: snippet,
        },
      ],
      status: response.status,
      bodySnippet: snippet,
    };
  }

  return {
    ok: true,
    successes: [
      {
        address,
        lat: coordinates.lat,
        lng: coordinates.lng,
      },
    ],
    failures: [],
    status: response.status,
    bodySnippet: snippet,
  };
}

async function geocodeBatch(addresses: string[], token: string): Promise<MapboxGeocodeResult> {
  const url = `https://api.mapbox.com/search/geocode/v6/batch?access_token=${token}`;
  const body = JSON.stringify(addresses.map((address) => ({ q: address })));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const text = await response.text();
  const snippet = createBodySnippet(text);

  if (!response.ok) {
    return {
      ok: false,
      successes: [],
      failures: addresses.map((address) => ({
        address,
        message: 'Mapbox batch geocode request failed.',
        status: response.status,
        bodySnippet: snippet,
      })),
      status: response.status,
      bodySnippet: snippet,
    };
  }

  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return {
      ok: false,
      successes: [],
      failures: addresses.map((address) => ({
        address,
        message: 'Mapbox batch response was not valid JSON.',
        status: response.status,
        bodySnippet: snippet,
      })),
      status: response.status,
      bodySnippet: snippet,
    };
  }

  const results: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.results)
      ? parsed.results
      : Array.isArray(parsed?.batch)
        ? parsed.batch
        : [];
  const successes: GeocodeSuccess[] = [];
  const failures: GeocodeFailure[] = [];

  addresses.forEach((address, index) => {
    const entry = results[index];
    const coordinates = entry ? findCoordinates(entry) : null;
    if (!coordinates) {
      failures.push({
        address,
        message: 'Mapbox did not return coordinates for this address.',
        status: response.status,
        bodySnippet: snippet,
      });
    } else {
      successes.push({
        address,
        lat: coordinates.lat,
        lng: coordinates.lng,
      });
    }
  });

  if (failures.length > 0) {
    return {
      ok: false,
      successes,
      failures,
      status: response.status,
      bodySnippet: snippet,
    };
  }

  return {
    ok: true,
    successes,
    failures: [],
    status: response.status,
    bodySnippet: snippet,
  };
}

async function computeOptimizedRoute(
  stops: GeocodeSuccess[],
  googleKey: string
): Promise<OrderedStop[]> {
  if (stops.length === 0) {
    return [];
  }

  const ordered: OrderedStop[] = [];
  let orderCounter = 0;

  for (let index = 0; index < stops.length; index += GOOGLE_OPTIMIZE_LIMIT) {
    const chunk = stops.slice(index, Math.min(index + GOOGLE_OPTIMIZE_LIMIT, stops.length));
    const optimizedChunk = await optimizeChunk(chunk, googleKey);

    optimizedChunk.forEach((stop) => {
      ordered.push({
        ...stop,
        order: orderCounter,
      });
      orderCounter += 1;
    });
  }

  return ordered;
}

async function optimizeChunk(stops: GeocodeSuccess[], googleKey: string): Promise<GeocodeSuccess[]> {
  if (stops.length <= 1) {
    return [...stops];
  }

  if (stops.length === 2) {
    return [...stops];
  }

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const intermediates = stops.slice(1, -1);

  const requestBody = {
    origin: {
      location: {
        latLng: {
          latitude: origin.lat,
          longitude: origin.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: destination.lat,
          longitude: destination.lng,
        },
      },
    },
    intermediates: intermediates.map((stop) => ({
      location: {
        latLng: {
          latitude: stop.lat,
          longitude: stop.lng,
        },
      },
    })),
    optimizeWaypointOrder: true,
    travelMode: 'DRIVE',
  };

  const response = await fetch(GOOGLE_ROUTES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleKey,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex',
    },
    body: JSON.stringify(requestBody),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Google Routes request failed (${response.status}): ${createBodySnippet(text) ?? text}`
    );
  }

  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Google Routes response was not valid JSON.');
  }

  const indicesRaw =
    parsed?.routes?.[0]?.optimizedIntermediateWaypointIndex ??
    parsed?.routes?.[0]?.optimizedIntermediateWaypointIndices ??
    [];

  const optimizedIndices: number[] = Array.isArray(indicesRaw)
    ? indicesRaw.filter((value) => typeof value === 'number' && value >= 0)
    : [];

  const fallbackOrder = intermediates.map((_, index) => index);
  const intermediateOrder =
    optimizedIndices.length === intermediates.length ? optimizedIndices : fallbackOrder;

  const orderedStops: GeocodeSuccess[] = [origin];

  intermediateOrder.forEach((intermediateIndex) => {
    const stop = intermediates[intermediateIndex];
    if (stop) {
      orderedStops.push(stop);
    }
  });

  orderedStops.push(destination);

  return orderedStops;
}

function createBodySnippet(source: string | null | undefined, maxLength = 400): string | undefined {
  if (!source) {
    return undefined;
  }
  return source.length > maxLength ? `${source.slice(0, maxLength)}…` : source;
}

function findCoordinates(entry: any): { lat: number; lng: number } | null {
  if (!entry) {
    return null;
  }

  const queue: any[] = [entry];
  const visited = new Set<any>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const coords = extractCoordinates(current);
    if (coords) {
      return coords;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
    } else {
      Object.values(current).forEach((value) => {
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      });
    }
  }

  return null;
}

function extractCoordinates(node: any): { lat: number; lng: number } | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const geometry = node.geometry;
  if (
    geometry &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 &&
    typeof geometry.coordinates[0] === 'number' &&
    typeof geometry.coordinates[1] === 'number'
  ) {
    const [lng, lat] = geometry.coordinates;
    return { lat, lng };
  }

  if (
    node.latLng &&
    typeof node.latLng.latitude === 'number' &&
    typeof node.latLng.longitude === 'number'
  ) {
    return { lat: node.latLng.latitude, lng: node.latLng.longitude };
  }

  if (
    typeof node.latitude === 'number' &&
    typeof node.longitude === 'number'
  ) {
    return { lat: node.latitude, lng: node.longitude };
  }

  return null;
}
