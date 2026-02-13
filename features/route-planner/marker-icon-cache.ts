// @ts-nocheck
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Skia } from '@shopify/react-native-skia';

import pinBlue from '@/assets/pins/pin-blue.png';
import pinGreen from '@/assets/pins/pin-green.png';

export type MarkerStatus = 'pending' | 'complete';

type MarkerIconParams = {
  label: string;
  status: MarkerStatus;
};

const CACHE_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}marker-icons/`;
const SCALE = 0.5;
const FONT_SIZE = Math.max(10, Math.round(20 * SCALE));
export const MARKER_LABEL_MAX_CHARS = 6;
export const MARKER_GENERATION_CONCURRENCY = 6;
export let MARKER_ICON_WIDTH = 24;
export let MARKER_ICON_HEIGHT = 24;
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

type MarkerIconSource = 'memory' | 'disk' | 'generated' | 'inflight';

type MarkerIconResult = {
  descriptor: MarkerIconDescriptor;
  source: MarkerIconSource;
};

let baseImagesLoaded = false;
let baseBlueImage: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null = null;
let baseGreenImage: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null = null;
let baseWidth = 0;
let baseHeight = 0;
let renderWidth = 0;
let renderHeight = 0;

const memoryCache = new Map<MarkerVisualKey, MarkerIconDescriptor>();
const inflight = new Map<MarkerVisualKey, Promise<MarkerIconResult>>();

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

async function loadBaseImages(): Promise<void> {
  if (baseImagesLoaded) {
    return;
  }

  const [blueAsset, greenAsset] = [
    Asset.fromModule(pinBlue),
    Asset.fromModule(pinGreen),
  ];

  await Promise.all([blueAsset.downloadAsync(), greenAsset.downloadAsync()]);

  const blueUri = blueAsset.localUri ?? blueAsset.uri;
  const greenUri = greenAsset.localUri ?? greenAsset.uri;

  const [blueData, greenData] = await Promise.all([
    Skia.Data.fromURI(blueUri),
    Skia.Data.fromURI(greenUri),
  ]);

  baseBlueImage = Skia.Image.MakeImageFromEncoded(blueData);
  baseGreenImage = Skia.Image.MakeImageFromEncoded(greenData);

  if (!baseBlueImage || !baseGreenImage) {
    throw new Error('Failed to decode base marker images.');
  }

  baseWidth = baseBlueImage.width();
  baseHeight = baseBlueImage.height();
  renderWidth = Math.max(1, Math.round(baseWidth * SCALE));
  renderHeight = Math.max(1, Math.round(baseHeight * SCALE));
  MARKER_ICON_WIDTH = renderWidth;
  MARKER_ICON_HEIGHT = renderHeight;
  baseImagesLoaded = true;
}

async function ensureCacheDir(): Promise<void> {
  if (!CACHE_DIR) {
    return;
  }
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function buildFilePath(key: string): string {
  return `${CACHE_DIR}${key}.png`;
}

export function normalizeMarkerLabel(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.slice(0, MARKER_LABEL_MAX_CHARS);
}

export function buildMarkerVisualKey(label: string, status: MarkerStatus): MarkerVisualKey {
  return `${normalizeMarkerLabel(label)}-${status}`;
}

function buildFileKey(label: string, status: MarkerStatus): string {
  const safe = normalizeMarkerLabel(label);
  return `${status}-${hashString(`${safe}-${status}-${SCALE}`)}`;
}

function buildDescriptor(key: MarkerVisualKey, uri: string): MarkerIconDescriptor {
  return {
    key,
    uri,
    width: renderWidth,
    height: renderHeight,
    anchorX: MARKER_ANCHOR_X,
    anchorY: MARKER_ANCHOR_Y,
  };
}

function drawLabelToImage(label: string, status: MarkerIconParams['status']): string {
  if (!baseBlueImage || !baseGreenImage) {
    throw new Error('Base images not loaded.');
  }

  const width = renderWidth;
  const height = renderHeight;
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) {
    throw new Error('Failed to allocate Skia surface.');
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));

  const baseImage = status === 'complete' ? baseGreenImage : baseBlueImage;
  const rect = Skia.XYWHRect(0, 0, width, height);
  canvas.drawImageRect(baseImage, rect);

  const typeface = Skia.Typeface.MakeDefault();
  const font = Skia.Font(typeface, FONT_SIZE);
  const text = normalizeMarkerLabel(label);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color('#ffffff'));

  const shadowPaint = Skia.Paint();
  shadowPaint.setAntiAlias(true);
  shadowPaint.setColor(Skia.Color('#000000aa'));

  const bounds = font.measureText(text, paint);
  const x = (width - bounds.width()) / 2 - bounds.x();
  const y = (height - bounds.height()) / 2 - bounds.y();

  canvas.drawText(text, x, y + 1, font, shadowPaint);
  canvas.drawText(text, x, y, font, paint);

  const image = surface.makeImageSnapshot();
  return image.encodeToBase64();
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
    await loadBaseImages();
    await ensureCacheDir();

    const fileKey = buildFileKey(label, status);
    const filePath = buildFilePath(fileKey);
    const existing = await FileSystem.getInfoAsync(filePath);
    if (existing.exists && existing.uri) {
      const descriptor = buildDescriptor(visualKey, existing.uri);
      memoryCache.set(visualKey, descriptor);
      return { descriptor, source: 'disk' as const };
    }

    const base64 = drawLabelToImage(label, status);
    await FileSystem.writeAsStringAsync(filePath, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const descriptor = buildDescriptor(visualKey, filePath);
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
