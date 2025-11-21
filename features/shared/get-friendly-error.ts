type FriendlyErrorOptions = {
  fallback: string;
};

const NETWORK_PATTERNS = [
  'network request failed',
  'failed to fetch',
  'network error',
  'socket hang up',
  'ecaccess',
  'timeout',
];

const SESSION_PATTERNS = ['unauthorized', 'forbidden', 'session expired', '401', '403'];

export function getFriendlyError(error: unknown, options: FriendlyErrorOptions): string {
  const { fallback } = options;
  const raw = extractMessage(error);

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[friendly-error]', raw || fallback, error);
  }

  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();

  if (NETWORK_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'We couldn\'t reach the server. Check your connection and try again.';
  }

  if (SESSION_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'Your session expired. Please sign in again.';
  }

  if (normalized.includes('daily limit') || normalized.includes('free tier')) {
    return 'Daily limit reached on the free plan. Enter a workspace invite code in Settings to unlock unlimited usage.';
  }

  if (normalized.includes('too many addresses') || normalized.includes('mapbox limit')) {
    return 'Too many addresses at once. Try fewer than 150 and try again.';
  }

  if (looksFriendly(raw)) {
    return raw.trim();
  }

  return fallback;
}

function extractMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' ? error : null;
  }

  if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  if ('msg' in error && typeof (error as { msg?: unknown }).msg === 'string') {
    return (error as { msg: string }).msg;
  }

  return null;
}

function looksFriendly(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.length > 180) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http ') || lower.startsWith('socket ') || lower.includes('stack')) {
    return false;
  }
  if (lower.includes('exception') || lower.includes('typeerror') || lower.includes('syntaxerror')) {
    return false;
  }
  return true;
}
