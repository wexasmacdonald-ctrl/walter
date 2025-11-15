import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, {
  Marker,
  type LatLng,
  type MapPressEvent,
  type MarkerDragEndEvent,
} from 'react-native-maps';

export type StopLocationEditorProps = {
  coordinate: LatLng;
  onChange: (coordinate: LatLng) => void;
  mapType?: 'standard' | 'satellite';
};

export function StopLocationEditor({
  coordinate,
  onChange,
  mapType = 'standard',
}: StopLocationEditorProps) {
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
    onChange(event.nativeEvent.coordinate);
  };

  const handleDragEnd = (event: MarkerDragEndEvent) => {
    onChange(event.nativeEvent.coordinate);
  };

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapType={mapType}
        region={region}
        onPress={handlePress}
      >
        <Marker
          coordinate={coordinate}
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
});
