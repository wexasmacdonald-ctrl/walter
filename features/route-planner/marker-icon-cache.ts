import { Buffer } from 'buffer';

export type MarkerStatus = 'pending' | 'complete';

type MarkerIconParams = {
  label: string;
  status: MarkerStatus;
};

export const MARKER_LABEL_MAX_CHARS = 4;
export const MARKER_GENERATION_CONCURRENCY = 6;
export const MARKER_ICON_WIDTH = 120;
export const MARKER_ICON_HEIGHT = 56;
export const MARKER_ANCHOR_X = 0.5;
export const MARKER_ANCHOR_Y = 1;
export const MARKER_CALLOUT_ANCHOR_X = 0.5;
export const MARKER_CALLOUT_ANCHOR_Y = 0;

export type MarkerVisualKey = `${string}-${MarkerStatus}`;

export type MarkerIconDescriptor = {
  key: MarkerVisualKey;
  uri: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
};

type MarkerIconSource = 'memory' | 'generated' | 'inflight';

type MarkerIconResult = {
  descriptor: MarkerIconDescriptor;
  source: MarkerIconSource;
};

const memoryCache = new Map<MarkerVisualKey, MarkerIconDescriptor>();
const inflight = new Map<MarkerVisualKey, Promise<MarkerIconResult>>();

export function normalizeMarkerLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  const leadingNumberMatch = trimmed.match(/^(\d{1,5})/);
  if (leadingNumberMatch) {
    const numeric = String(Number.parseInt(leadingNumberMatch[1], 10));
    return numeric;
  }
  return trimmed.slice(0, MARKER_LABEL_MAX_CHARS).toUpperCase();
}

export function buildMarkerVisualKey(label: string, status: MarkerStatus): MarkerVisualKey {
  return `${normalizeMarkerLabel(label)}-${status}`;
}

function buildDescriptor(key: MarkerVisualKey, uri: string): MarkerIconDescriptor {
  return {
    key,
    uri,
    width: MARKER_ICON_WIDTH,
    height: MARKER_ICON_HEIGHT,
    anchorX: MARKER_ANCHOR_X,
    anchorY: MARKER_ANCHOR_Y,
  };
}

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function createSvgMarker(label: string, status: MarkerStatus): string {
  const text = normalizeMarkerLabel(label).slice(0, 4);
  const fill = status === 'complete' ? '#16A34A' : '#2563EB';
  const textColor = '#FFFFFF';
  const borderColor = 'rgba(0,0,0,0.2)';

  const width = MARKER_ICON_WIDTH;
  const height = MARKER_ICON_HEIGHT;
  const radius = 18;
  const pointerWidth = 20;
  const pointerHeight = 10;
  const bodyHeight = height - pointerHeight;
  const pointerX = width / 2;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="1" y="1" width="${width - 2}" height="${bodyHeight - 1}" rx="${radius}" ry="${radius}" fill="${fill}" stroke="${borderColor}" stroke-width="1.5"/>
  <path d="M ${pointerX - pointerWidth / 2} ${bodyHeight - 1} L ${pointerX} ${height - 1} L ${pointerX + pointerWidth / 2} ${bodyHeight - 1} Z" fill="${fill}" stroke="${borderColor}" stroke-width="1.5"/>
  <text x="50%" y="${bodyHeight / 2 + 6}" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="${textColor}">${text}</text>
</svg>`;

  return encodeSvg(svg);
}

export async function ensureMarkerIcon({
  label,
  status,
}: MarkerIconParams): Promise<string> {
  const result = await getMarkerIconDescriptor({ label, status });
  return result.descriptor.uri;
}

export async function getMarkerIconDescriptor({
  label,
  status,
}: MarkerIconParams): Promise<MarkerIconResult> {
  const visualKey = buildMarkerVisualKey(label, status);
  const cached = memoryCache.get(visualKey);
  if (cached) {
    return { descriptor: cached, source: 'memory' };
  }

  const inflightPromise = inflight.get(visualKey);
  if (inflightPromise) {
    return { descriptor: (await inflightPromise).descriptor, source: 'inflight' };
  }

  const promise = (async () => {
    const uri = createSvgMarker(label, status);
    const descriptor = buildDescriptor(visualKey, uri);
    memoryCache.set(visualKey, descriptor);
    return { descriptor, source: 'generated' as const };
  })();

  inflight.set(visualKey, promise);

  try {
    return await promise;
  } finally {
    inflight.delete(visualKey);
  }
}
