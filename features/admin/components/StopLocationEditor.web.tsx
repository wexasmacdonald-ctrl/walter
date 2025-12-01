import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { StyleSheet, Text, View } from 'react-native';

import { getGoogleMapsApiKey } from '@/features/route-planner/getGoogleMapsApiKey';
import type { StopLocationEditorProps } from './StopLocationEditor.types';

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();

type LatLngish = google.maps.LatLngLiteral | google.maps.LatLng | null | undefined;

function toCoordinate(latLng: LatLngish) {
  if (!latLng) {
    return null;
  }
  if (typeof (latLng as google.maps.LatLng).lat === 'function') {
    const ref = latLng as google.maps.LatLng;
    return { latitude: ref.lat(), longitude: ref.lng() };
  }
  const literal = latLng as google.maps.LatLngLiteral;
  if (typeof literal.lat === 'number' && typeof literal.lng === 'number') {
    return { latitude: literal.lat, longitude: literal.lng };
  }
  return null;
}

export function StopLocationEditor({
  coordinate,
  onChange,
  mapType = 'standard',
}: StopLocationEditorProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.notice}>
          Google Maps API key missing. Set EXPO_PUBLIC_GOOGLE_API_KEY to adjust pins.
        </Text>
      </View>
    );
  }

  const center = {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
  };

  const mapTypeId = mapType === 'satellite' ? 'satellite' : 'roadmap';

  const handleMapClick = (event: { detail?: { latLng: google.maps.LatLngLiteral | null } }) => {
    const next = toCoordinate(event?.detail?.latLng);
    if (next) {
      onChange(next);
    }
  };

  const handleMarkerDragEnd = (event: google.maps.MapMouseEvent) => {
    const next = toCoordinate(event?.latLng);
    if (next) {
      onChange(next);
    }
  };

  return (
    <View style={styles.container}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          style={styles.map}
          center={center}
          mapTypeId={mapTypeId}
          zoom={17}
          onClick={handleMapClick}
        >
          <Marker
            position={center}
            draggable
            onDragEnd={handleMarkerDragEnd}
          />
        </Map>
      </APIProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 320,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  notice: {
    textAlign: 'center',
  },
});
