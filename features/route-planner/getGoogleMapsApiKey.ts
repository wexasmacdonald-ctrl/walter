export function getGoogleMapsApiKey(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    ''
  );
}
