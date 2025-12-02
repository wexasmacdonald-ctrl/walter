const envBase = process.env.EXPO_PUBLIC_API_BASE_URL;
const normalizedBase =
  typeof envBase === 'string' && envBase.trim().length > 0
    ? envBase.trim().replace(/\/+$/, '')
    : null;

export const API_BASE = normalizedBase ?? 'https://api.blow-grid.com';
