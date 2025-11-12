# Google Maps SDK Keys

`react-native-maps` uses native Google tiles when `provider={PROVIDER_GOOGLE}`. That means iOS and Android builds need Maps SDK keys baked in at build time (web keys don’t work). Use this checklist whenever the map shows a beige screen in TestFlight/Production.

## 1. Enable APIs

In Google Cloud Console:

1. Select your project.
2. Enable **Maps SDK for iOS**.
3. Enable **Maps SDK for Android**.

## 2. Create platform keys

Create two API keys so you can restrict them per platform:

| Key | Restrictions | Env var |
|-----|--------------|---------|
| iOS Maps SDK | Bundle identifier `com.macdonaldautomation.blowpin` | `GOOGLE_MAPS_IOS_KEY` |
| Android Maps SDK | Package `com.macdonaldautomation.blowpin` + SHA‑1 from your signing cert (Expo/EAS build credentials) | `GOOGLE_MAPS_ANDROID_KEY` |

You can reuse a single unrestricted key for both, but two keys are safer.

## 3. Store the keys

1. Copy `.env.example` to `.env.local` (or your preferred env file) and fill in the values:
   ```bash
   cp .env.example .env.local
   ```
2. During development, export the vars before `npx expo start` (PowerShell example):
   ```powershell
   setx GOOGLE_MAPS_IOS_KEY "ios-key-here"
   setx GOOGLE_MAPS_ANDROID_KEY "android-key-here"
   ```
   Restart your terminal so `app.json` can substitute `${GOOGLE_MAPS_*}`.
3. For EAS builds, add the secrets so the cloud build has access:
   ```bash
   eas secret:create --name=GOOGLE_MAPS_IOS_KEY --value=ios-key-here
   eas secret:create --name=GOOGLE_MAPS_ANDROID_KEY --value=android-key-here
   ```
   (Run once per project/owner.)

`app.json` already references these vars under `expo.ios.config.googleMapsApiKey` and `expo.android.config.googleMaps.apiKey`, so no additional code changes are required.

## 4. Rebuild

After the secrets exist, trigger a new build (`eas build --platform ios`). Install the new TestFlight build—map tiles should render normally instead of the beige placeholder.
