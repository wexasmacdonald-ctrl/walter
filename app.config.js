// Requires IOS_GOOGLE_MAPS_API_KEY to be set in expo.dev Project Secrets
export default ({ config }) => {
  const iosGoogleMapsApiKey = process.env.IOS_GOOGLE_MAPS_API_KEY ?? '';
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_KEY ?? '';

  return {
    ...config,
    name: 'my-app',
    slug: 'my-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'myapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      bundleIdentifier: 'com.macdonaldautomation.blowpin',
      supportsTablet: true,
      config: {
        googleMapsApiKey: iosGoogleMapsApiKey,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Allow my-app to access your location to show your position on the map.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.macdonaldautomation.blowpin',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
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
      favicon: './assets/images/favicon.png',
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
          locationAlwaysAndWhenInUsePermission:
            'Allow my-app to access your location so we can display nearby stops.',
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
      './plugins/with-react-native-maps',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '2b5e1487-24bf-43b2-bf01-4f6b98926e5c',
      },
    },
  };
};
