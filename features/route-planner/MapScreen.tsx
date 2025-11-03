import { Platform } from 'react-native';

import { MapScreen as NativeMapScreen } from './MapScreen.native';
import { MapScreen as WebMapScreen } from './MapScreen.web';
import type { MapScreenProps } from './MapScreen.native';

export function MapScreen(props: MapScreenProps) {
  if (Platform.OS === 'web') {
    return <WebMapScreen {...props} />;
  }

  return <NativeMapScreen {...props} />;
}
