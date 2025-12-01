import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LatLng, MapPressEvent, MarkerDragStartEndEvent } from 'react-native-maps';

import type { StopLocationEditorProps } from './StopLocationEditor.types';

export function StopLocationEditor({
  coordinate,
  onChange,
  mapType = 'standard',
}: StopLocationEditorProps) {
  const mapModule = useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('react-native-maps') as typeof import('react-native-maps');
    } catch (error) {
      console.warn('react-native-maps unavailable; rendering fallback stop editor', error);
      return null;
    }
  }, []);

  const MapView = mapModule?.default ?? null;
  const Marker = mapModule?.Marker ?? null;

  const region = useMemo(
    () => ({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }),
    [coordinate.latitude, coordinate.longitude]
  );

  const handlePress = (event: MapPressEvent) => {
    const next = event.nativeEvent.coordinate;
    onChange({ latitude: next.latitude, longitude: next.longitude });
  };

  const handleDragEnd = (event: MarkerDragStartEndEvent) => {
    const next = event.nativeEvent.coordinate;
    onChange({ latitude: next.latitude, longitude: next.longitude });
  };

  if (!MapView || !Marker) {
    return (
      <View style={[styles.container, styles.fallbackContainer]}>
        <Text style={styles.fallbackTitle}>Map editor unavailable</Text>
        <Text style={styles.fallbackBody}>
          Expo Go does not include the native maps module. Use a custom dev client or production build to adjust pins
          directly on the map.
        </Text>
        <Text style={styles.fallbackBody}>
          Current pin: ({coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)})
        </Text>
      </View>
    );
  }

  const markerCoordinate = useMemo<LatLng>(
    () => ({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    }),
    [coordinate.latitude, coordinate.longitude]
  );

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapType={mapType}
        region={region}
        onPress={handlePress}
      >
        <Marker
          coordinate={markerCoordinate}
          draggable
          onDragEnd={handleDragEnd}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  fallbackContainer: {
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
    gap: 8,
    backgroundColor: '#fff',
  },
  fallbackTitle: {
    fontWeight: '600',
  },
  fallbackBody: {
    color: '#475569',
  },
});
