import { Asset } from 'expo-asset';

import {
  COMPLETE_MARKER_ASSETS,
  MAX_BUNDLED_MARKER_LABEL,
  PENDING_MARKER_ASSETS,
} from './generated-marker-assets';

const pinBlue = require('../../assets/pins/pin-blue.png');
const pinGreen = require('../../assets/pins/pin-green.png');

export type MarkerStatus = 'pending' | 'complete';

type MarkerIconParams = {
  label: string;
  status: MarkerStatus;
};

export const MARKER_LABEL_MAX_CHARS = 4;
export const MARKER_GENERATION_CONCURRENCY = 6;
export const MARKER_ICON_WIDTH = 140;
export const MARKER_ICON_HEIGHT = 60;
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

type MarkerIconSource = 'memory' | 'bundled' | 'fallback' | 'inflight';

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
  if (/^\d+$/.test(trimmed)) {
    const numeric = String(Number.parseInt(trimmed, 10));
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

function getModuleForLabel(label: string, status: MarkerStatus): number | null {
  const normalized = normalizeMarkerLabel(label);
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const value = Number.parseInt(normalized, 10);
  if (!Number.isFinite(value) || value < 1 || value > MAX_BUNDLED_MARKER_LABEL) {
    return null;
  }
  return status === 'complete'
    ? (COMPLETE_MARKER_ASSETS[normalized] ?? null)
    : (PENDING_MARKER_ASSETS[normalized] ?? null);
}

async function resolveAssetUri(moduleRef: number): Promise<string> {
  const asset = Asset.fromModule(moduleRef);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
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
    const bundledModule = getModuleForLabel(label, status);
    const source: MarkerIconSource = bundledModule ? 'bundled' : 'fallback';
    const fallbackModule = status === 'complete' ? pinGreen : pinBlue;
    const uri = await resolveAssetUri(bundledModule ?? fallbackModule);
    const descriptor = buildDescriptor(visualKey, uri);
    memoryCache.set(visualKey, descriptor);
    return { descriptor, source };
  })();

  inflight.set(visualKey, promise);

  try {
    return await promise;
  } finally {
    inflight.delete(visualKey);
  }
}
