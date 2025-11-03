import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

import { Stop } from './types';

export type MapScreenProps = {
  pins: Stop[];
  loading?: boolean;
};

type UserLocation = {
  latitude: number;
  longitude: number;
};

const PIN_COLOR = '#2563eb';

export function MapScreen({ pins, loading }: MapScreenProps) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function requestLocation() {
      setRequesting(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) {
          return;
        }

        if (status !== 'granted') {
          setPermissionDenied(true);
          setRequesting(false);
          return;
        }

        const position = await Location.getCurrentPositionAsync({});
        if (!mounted) {
          return;
        }

        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        if (!mounted) {
          return;
        }
        setPermissionDenied(true);
      } finally {
        if (mounted) {
          setRequesting(false);
        }
      }
    }

    requestLocation();
    return () => {
      mounted = false;
    };
  }, []);

  const region = useMemo(() => {
    const pinWithCoords = pins.find(
      (pin) => typeof pin.lat === 'number' && typeof pin.lng === 'number'
    );

    if (pinWithCoords) {
      return {
        latitude: pinWithCoords.lat as number,
        longitude: pinWithCoords.lng as number,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }

    if (location) {
      return {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }

    return {
      latitude: 45.4215,
      longitude: -75.6972,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [location, pins]);

  const markers = useMemo(() => {
    return pins
      .map((pin, index) => ({ pin, index }))
      .filter(({ pin }) => typeof pin.lat === 'number' && typeof pin.lng === 'number')
      .map(({ pin, index }) => ({
        key: pin.id ?? String(index),
        label: String(index + 1),
        title: pin.address,
        coordinate: {
          latitude: pin.lat as number,
          longitude: pin.lng as number,
        },
      }));
  }, [pins]);

  const hasCoords = markers.length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Map Preview</Text>
      {!hasCoords && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Pins appear once addresses are geocoded.</Text>
        </View>
      )}
      <View style={styles.mapWrapper}>
        <MapView
          style={styles.map}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton
          showsCompass
        >
          {markers.map((marker) => (
            <Marker
              key={marker.key}
              coordinate={marker.coordinate}
              title={marker.title}
              tracksViewChanges={false}
            >
              <View style={[styles.marker, { backgroundColor: PIN_COLOR }]}>
                <Text style={styles.markerLabel}>{marker.label}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
        {loading && !requesting && (
          <View style={styles.overlay}>
            <ActivityIndicator />
            <Text style={styles.overlayText}>Loading pins...</Text>
          </View>
        )}
        {requesting && (
          <View style={styles.overlay}>
            <ActivityIndicator />
            <Text style={styles.overlayText}>Fetching your location...</Text>
          </View>
        )}
        {permissionDenied && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>
              Location permission denied. Enable it to show your dot.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 48,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  notice: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  noticeText: {
    color: '#4338ca',
    fontSize: 14,
  },
  mapWrapper: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d4d4d8',
  },
  map: {
    flex: 1,
  },
  marker: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayText: {
    marginTop: 12,
    textAlign: 'center',
    color: '#374151',
  },
});
