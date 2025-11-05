import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import MapView, { Marker, type LatLng } from 'react-native-maps';
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
const CONFIRMED_PIN_COLOR = '#22c55e';
const SELECTED_PIN_COLOR = '#60a5fa';
const SELECTED_CONFIRMED_PIN_COLOR = '#86efac';

function extractHouseNumber(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }

  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}

export function MapScreen({ pins, loading }: MapScreenProps) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedPinKey, setSelectedPinKey] = useState<string | null>(null);
  const [confirmedPins, setConfirmedPins] = useState<Record<string, number>>({});

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

  const coordinates = useMemo<LatLng[]>(() => {
    return pins
      .filter((pin) => typeof pin.lat === 'number' && typeof pin.lng === 'number')
      .map((pin) => ({
        latitude: pin.lat as number,
        longitude: pin.lng as number,
      }));
  }, [pins]);

  const region = useMemo(() => {
    if (coordinates.length > 0) {
      const lats = coordinates.map((coord) => coord.latitude);
      const lngs = coordinates.map((coord) => coord.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const latitudeDelta = Math.max(maxLat - minLat, 0.01) * 1.4;
      const longitudeDelta = Math.max(maxLng - minLng, 0.01) * 1.4;

      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta,
        longitudeDelta,
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
  }, [coordinates, location]);

  const markers = useMemo(() => {
    return pins
      .map((pin, index) => ({ pin, index }))
      .filter(({ pin }) => typeof pin.lat === 'number' && typeof pin.lng === 'number')
      .map(({ pin, index }) => {
        const label =
          typeof pin.label === 'string' && pin.label.trim()
            ? pin.label.trim()
            : extractHouseNumber(pin.address) ?? String(index + 1);
        return {
          key: pin.id ?? String(index),
          label,
          title: pin.address,
          coordinate: {
            latitude: pin.lat as number,
            longitude: pin.lng as number,
          },
        };
      });
  }, [pins]);

  useEffect(() => {
    if (!selectedPinKey) {
      return;
    }

    if (!markers.some((marker) => marker.key === selectedPinKey)) {
      setSelectedPinKey(null);
    }
  }, [markers, selectedPinKey]);

  const selectedMarker = useMemo(
    () => markers.find((marker) => marker.key === selectedPinKey),
    [markers, selectedPinKey]
  );
  const mapRef = useRef<MapView | null>(null);
  const modalMapRef = useRef<MapView | null>(null);
  const hasCoords = markers.length > 0;

  const fitToPins = (targetRef: MutableRefObject<MapView | null>) => {
    if (coordinates.length === 0 || !targetRef.current) {
      return;
    }

    targetRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 80, right: 40, bottom: 80, left: 40 },
      animated: true,
    });
  };

  useEffect(() => {
    fitToPins(mapRef);
    if (isFullScreen) {
      fitToPins(modalMapRef);
    }
  }, [coordinates, isFullScreen]);

  useEffect(() => {
    if (!isFullScreen) {
      return;
    }

    const timeout = setTimeout(() => fitToPins(modalMapRef), 0);
    return () => clearTimeout(timeout);
  }, [isFullScreen, coordinates]);

  const confirmPin = (key: string) => {
    setConfirmedPins((prev) => ({
      ...prev,
      [key]: Date.now(),
    }));
  };

  const requestUndo = (key: string) => {
    Alert.alert(
      'Undo confirmation',
      'Are you sure you want to undo this confirmation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: () => {
            setConfirmedPins((prev) => {
              const { [key]: _removed, ...rest } = prev;
              return rest;
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderMapView = (mapStyle: StyleProp<ViewStyle>, variant: 'primary' | 'modal') => (
    <MapView
      ref={variant === 'primary' ? mapRef : modalMapRef}
      style={mapStyle}
      initialRegion={region}
      showsUserLocation
      showsMyLocationButton
      showsCompass
      mapType="satellite"
      onPress={(event) => {
        if (event?.nativeEvent?.action !== 'marker-press') {
          setSelectedPinKey(null);
        }
      }}
    >
      {markers.map((marker) => {
        const confirmed = Boolean(confirmedPins[marker.key]);
        const isSelected = marker.key === selectedPinKey;
        const backgroundColor = isSelected
          ? confirmed
            ? SELECTED_CONFIRMED_PIN_COLOR
            : SELECTED_PIN_COLOR
          : confirmed
          ? CONFIRMED_PIN_COLOR
          : PIN_COLOR;

        return (
          <Marker
            key={marker.key}
            coordinate={marker.coordinate}
            tracksViewChanges
            anchor={{ x: 0.5, y: 1 }}
            calloutAnchor={{ x: 0.5, y: 0.5 }}
            onPress={() => setSelectedPinKey(marker.key)}
          >
            <View
              style={[
                styles.marker,
                isSelected && styles.markerSelected,
                { backgroundColor },
              ]}
            >
              <Text style={styles.markerLabel}>{marker.label}</Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );

  const renderCallout = (marker: typeof selectedMarker, variant: 'primary' | 'modal') => {
    if (!marker) {
      return null;
    }

    const confirmed = Boolean(confirmedPins[marker.key]);
    const containerStyle = variant === 'primary' ? styles.mapCallout : styles.fullScreenCallout;

    return (
      <View style={containerStyle} pointerEvents="box-none">
        <View style={styles.calloutCard}>
          <View style={styles.calloutText}>
            <Text style={styles.calloutLabel}>{marker.label}</Text>
            <Text style={styles.calloutTitle} numberOfLines={2}>
              {marker.title}
            </Text>
            <Text style={styles.calloutStatus}>
              {confirmed
                ? 'Snow cleared. Tap undo to revert.'
                : 'Tap "Snow cleared" once this stop is finished.'}
            </Text>
          </View>
          <View style={styles.calloutActions}>
            <Pressable
              style={styles.calloutCloseButton}
              accessibilityRole="button"
              onPress={() => setSelectedPinKey(null)}
            >
              <Text style={styles.calloutCloseText}>Close</Text>
            </Pressable>
            {confirmed ? (
              <Pressable
                style={[styles.secondaryButton, styles.undoButton]}
                accessibilityRole="button"
                onPress={() => requestUndo(marker.key)}
              >
                <Text style={styles.secondaryButtonText}>Undo</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.primaryButton}
                accessibilityRole="button"
                onPress={() => confirmPin(marker.key)}
              >
                <Text style={styles.primaryButtonText}>Snow cleared</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderOverlay = () => {
    if (loading && !requesting) {
      return (
        <View style={styles.overlay}>
          <ActivityIndicator />
          <Text style={styles.overlayText}>Loading pins...</Text>
        </View>
      );
    }

    if (requesting) {
      return (
        <View style={styles.overlay}>
          <ActivityIndicator />
          <Text style={styles.overlayText}>Fetching your location...</Text>
        </View>
      );
    }

    if (permissionDenied) {
      return (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>
            Location permission denied. Enable it to show your dot.
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Map Preview</Text>
        <Pressable
          style={styles.fullScreenButton}
          accessibilityRole="button"
          onPress={() => setIsFullScreen(true)}
        >
          <Text style={styles.fullScreenButtonText}>Full Screen</Text>
        </Pressable>
      </View>
      {!hasCoords && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Pins appear once addresses are geocoded.</Text>
        </View>
      )}
      <View style={styles.mapWrapper}>
        {renderMapView(styles.map, 'primary')}
        {renderOverlay()}
      </View>
      {renderCallout(selectedMarker, 'primary')}

      <Modal
        visible={isFullScreen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsFullScreen(false)}
      >
        <View style={styles.fullScreenContainer}>
          <View style={styles.fullScreenHeader}>
            <Text style={styles.fullScreenTitle}>Map Preview</Text>
            <Pressable
              style={styles.closeButton}
              accessibilityRole="button"
              onPress={() => setIsFullScreen(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.fullScreenMapWrapper}>
            {renderMapView(styles.fullScreenMap, 'modal')}
            {renderCallout(selectedMarker, 'modal')}
            {renderOverlay()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  fullScreenButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  fullScreenButtonText: {
    color: '#2563eb',
    fontWeight: '600',
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
  mapCallout: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  fullScreenCallout: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  calloutCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#cbd5f5',
    gap: 12,
  },
  calloutText: {
    gap: 4,
  },
  calloutLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  calloutStatus: {
    fontSize: 13,
    color: '#475569',
  },
  calloutActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  calloutCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  calloutCloseText: {
    color: '#475569',
    fontWeight: '600',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d4d4d8',
  },
  secondaryButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
  undoButton: {
    borderColor: '#dc2626',
  },
  marker: {
    minWidth: 40,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerSelected: {
    transform: [{ scale: 1.12 }],
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
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
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  fullScreenHeader: {
    paddingTop: 48,
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    gap: 16,
  },
  fullScreenTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  fullScreenMapWrapper: {
    flex: 1,
    margin: 24,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d4d4d8',
  },
  fullScreenMap: {
    flex: 1,
  },
});
