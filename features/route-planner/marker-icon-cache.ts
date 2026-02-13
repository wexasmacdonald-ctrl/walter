export type MarkerStatus = 'pending' | 'complete';

export const MARKER_ANCHOR_X = 0.5;
export const MARKER_ANCHOR_Y = 1;
export const MARKER_CALLOUT_ANCHOR_X = 0.5;
export const MARKER_CALLOUT_ANCHOR_Y = 0;

export const ANDROID_PIN_ICON_WIDTH = 140;
export const ANDROID_PIN_ICON_HEIGHT = 60;

export type AndroidPinTheme = 'light' | 'dark';

export type AndroidPinVisualKey = `${string}|${MarkerStatus}|${AndroidPinTheme}`;

export type AndroidPinIconDescriptor = {
  key: AndroidPinVisualKey;
  uri: string;
  width: number;
  height: number;
};

export function extractLeadingAddressToken(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const match = trimmed.match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : '';
}

export function normalizeMarkerLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const token = extractLeadingAddressToken(trimmed);
  if (token) {
    return token;
  }

  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function buildAndroidPinVisualKey(
  label: string,
  status: MarkerStatus,
  theme: AndroidPinTheme
): AndroidPinVisualKey {
  const normalized = normalizeMarkerLabel(label) || '?';
  return `${normalized}|${status}|${theme}`;
}
