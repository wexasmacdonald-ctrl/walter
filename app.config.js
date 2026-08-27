export default ({ config }) => {
  const androidGoogleMapsApiKey =
    process.env.GOOGLE_MAPS_ANDROID_KEY ??
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY ??
    '';

  return {
    ...config,
    name: 'Blow-Grid',
    slug: 'my-app',
    version: '1.1.3',
    orientation: 'default',
    icon: './assets/images/icon.png',
    scheme: 'blowgrid',
    userInterfaceStyle: 'automatic',
    // Reanimated/worklets in this dependency set require New Architecture.
    newArchEnabled: true,
    ios: {
      bundleIdentifier: 'com.macdonaldautomation.blowpin',
      buildNumber: '27',
      supportsTablet: false,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Blow-Grid uses your location to show where you are relative to your stops on the map.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.macdonaldautomation.blowpin',
      versionCode: 38,
      allowBackup: false,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.WAKE_LOCK',
      ],
      ...(androidGoogleMapsApiKey
        ? {
            config: {
              googleMaps: {
                apiKey: androidGoogleMapsApiKey,
              },
            },
          }
        : {}),
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon-v2.png',
      manifest: {
        icons: [
          {
            src: './assets/images/favicon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: './assets/images/favicon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: './assets/images/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
    },
    plugins: [
      'expo-router',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: false,
          locationAlwaysPermission: false,
          locationWhenInUsePermission:
            'Blow-Grid uses your location to show where you are relative to your stops on the map.',
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '2b5e1487-24bf-43b2-bf01-4f6b98926e5c',
      },
    },
  };
};
