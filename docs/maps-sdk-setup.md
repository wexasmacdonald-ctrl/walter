# Google Maps SDK Key (Android)

Blow-Grid uses Google Maps on Android and Apple MapKit on iOS. Only the Android build needs a Google Maps SDK key. Web keys do not work for the Android SDK. Use this checklist whenever the Android map shows a beige screen.

## 1. Enable APIs

In Google Cloud Console:

1. Select your project.
2. Enable **Maps SDK for Android**.

## 2. Create the Android key

Create a key restricted to the production Android app:

| Key | Restrictions | Env var |
|-----|--------------|---------|
| Android Maps SDK | Package `com.macdonaldautomation.blowpin` + SHA-1 from your signing cert (Expo/EAS build credentials) | `GOOGLE_MAPS_ANDROID_KEY` |

Use the Google Play app-signing SHA-1 for production Play builds. Google Play Internal App Sharing re-signs uploaded builds with a separate certificate, so the Android key must also allow:

- Package: `com.macdonaldautomation.blowpin`
- Internal App Sharing SHA-1: `8B:EF:29:58:B1:C5:91:E9:FC:28:AD:34:D6:17:99:81:35:D7:68:91`

A locally debug-signed APK will show a beige map unless its debug certificate is separately allowed.

## 3. Store the keys

1. Copy `.env.example` to `.env.local` (or your preferred env file) and fill in the values:
   ```bash
   cp .env.example .env.local
   ```
2. During development, export the vars before `npx expo start` (PowerShell example):
   ```powershell
   setx GOOGLE_MAPS_ANDROID_KEY "android-key-here"
   ```
   Restart your terminal so `app.json` can substitute `${GOOGLE_MAPS_*}`.
3. For EAS builds, add the secrets so the cloud build has access:
   ```bash
   eas secret:create --name=GOOGLE_MAPS_ANDROID_KEY --value=android-key-here
   ```
   (Run once per project/owner.)

`app.config.js` injects this value into `expo.android.config.googleMaps.apiKey`, so no additional native code changes are required.

## 4. Rebuild

After the secret exists, trigger a new Android build (`eas build --platform android`). For a definitive map test, install a Google Play-signed build; the production key is intentionally restricted to that signing certificate.

## iOS

iOS uses Apple MapKit through `react-native-maps`. Do not add `GMSApiKey`, the Google Maps iOS SDK config plugin, or `GOOGLE_MAPS_IOS_KEY` to the release configuration.
