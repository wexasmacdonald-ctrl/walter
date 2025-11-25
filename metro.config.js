const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('md');

// Expo Go does not bundle react-native-worklets; provide a stub so the app can run in Expo Go.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'react-native-worklets': path.resolve(__dirname, 'stubs/react-native-worklets.js'),
};

module.exports = config;
