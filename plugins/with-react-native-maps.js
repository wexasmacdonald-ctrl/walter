const { withMaps } = require('@expo/config-plugins/build/ios/Maps');

/**
 * Ensures Google Maps SDK is linked on iOS builds generated via Expo prebuild/EAS.
 * Uses the API key you already expose through `ios.config.googleMapsApiKey`.
 */
module.exports = function withReactNativeMaps(config) {
  return withMaps(config);
};
