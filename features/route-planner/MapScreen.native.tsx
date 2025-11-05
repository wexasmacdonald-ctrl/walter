import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import * as Location from 'expo-location';

import { MarkerBadge } from '@/components/MarkerBadge';
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
const SELECTED_PIN_COLOR = '#60a5fa';
const CONFIRMED_PIN_COLOR = '#22c55e';
const SELECTED_CONFIRMED_PIN_COLOR = '#86efac';

export function MapScreen({ pins, loading = false }: MapScreenProps) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});

  const mapRef = useRef<MapView | null>(null);
  const modalMapRef = useRef<MapView | null>(null);

  useEffect(() => {
    let mounted = true;

    async function requestLocation() {
      setRequestingLocation(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) {
          return;
        }

        if (status !== 'granted') {
          setPermissionDenied(true);
          setRequestingLocation(false);
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
        if (mounted) {
          setPermissionDenied(true);
        }
      } finally {
        if (mounted) {
          setRequestingLocation(false);
        }
      }
    }

    requestLocation();
    return () => {
      mounted = false;
    };
  }, []);

  const markers = useMemo(() => {
    return pins
      .filter((pin): pin is Stop & { lat: number; lng: number } => typeof pin.lat === 'number' && typeof pin.lng === 'number')
      .map((pin, index) => {
        const label =
          typeof pin.label === 'string' && pin.label.trim().length > 0
            ? pin.label.trim()
            : extractHouseNumber(pin.address) ?? String(index + 1);

        return {
          id: pin.id ?? String(index),
          coordinate: { latitude: pin.lat, longitude: pin.lng } as LatLng,
          address: pin.address,
          label,
        };
      });
  }, [pins]);

  const coordinates = useMemo<LatLng[]>(() => markers.map((marker) => marker.coordinate), [markers]);

  useEffect(() => {
    fitToMarkers(mapRef.current, coordinates);
    if (isFullScreen) {
      fitToMarkers(modalMapRef.current, coordinates);
    }
  }, [coordinates, isFullScreen]);

  useEffect(() => {
    if (selectedId && !markers.some((marker) => marker.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, markers]);

  const selectedMarker = useMemo(
    () => markers.find((marker) => marker.id === selectedId) ?? null,
    [markers, selectedId]
  );

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleConfirm = (id: string) => {
    setConfirmed((prev) => ({ ...prev, [id]: Date.now() }));
    setSelectedId(null);
  };

  const handleUndo = (id: string) => {
    Alert.alert('Undo confirmation', 'Are you sure you want to undo this confirmation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: () =>
          setConfirmed((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          }),
      },
    ]);
    setSelectedId(null);
  };

  const renderMarkers = () =>
    markers.map((marker) => {
      const isSelected = marker.id === selectedId;
      const isConfirmed = Boolean(confirmed[marker.id]);
      const backgroundColor = isSelected
        ? isConfirmed
          ? SELECTED_CONFIRMED_PIN_COLOR
          : SELECTED_PIN_COLOR
        : isConfirmed
        ? CONFIRMED_PIN_COLOR
        : PIN_COLOR;

      return (
        <MarkerBadge
          key={marker.id}
          id={marker.id}
          coordinate={marker.coordinate}
          label={marker.label}
          backgroundColor={backgroundColor}
          selected={isSelected}
          onPress={() => handleSelect(marker.id)}
        />
      );
    });

  const renderToast = (variant: 'primary' | 'modal') => {
    if (!selectedMarker) {
      return null;
    }
    const isConfirmed = Boolean(confirmed[selectedMarker.id]);
    const containerStyle =
      variant === 'primary' ? styles.toastContainer : styles.toastContainerFullScreen;

    return (
      <View pointerEvents="box-none" style={styles.toastOverlay}>
        <View style={containerStyle}>
          <View style={styles.toastCard}>
            <Text style={styles.toastLabel}>{selectedMarker.label}</Text>
            <Text style={styles.toastTitle} numberOfLines={2}>
              {selectedMarker.address || 'Address unavailable'}
            </Text>
            <Text style={styles.toastStatus}>
              {isConfirmed
                ? 'Snow cleared. Tap undo to revert.'
                : 'Tap “Snow cleared” once this stop is finished.'}
            </Text>
            <View style={styles.toastActions}>
              <Pressable style={[styles.toastButton, styles.toastButtonGhost]} onPress={() => setSelectedId(null)}>
                <Text style={styles.toastButtonGhostText}>Close</Text>
              </Pressable>
              {isConfirmed ? (
                <Pressable
                  style={[styles.toastButton, styles.toastButtonDanger]}
                  onPress={() => handleUndo(selectedMarker.id)}
                >
                  <Text style={styles.toastButtonDangerText}>Undo</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.toastButton, styles.toastButtonPrimary]}
                  onPress={() => handleConfirm(selectedMarker.id)}
                >
                  <Text style={styles.toastButtonPrimaryText}>Snow cleared</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderOverlay = () => {
    if (loading && !requestingLocation) {
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator />
          <Text style={styles.mapOverlayText}>Loading pins…</Text>
        </View>
      );
    }

    if (requestingLocation) {
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator />
          <Text style={styles.mapOverlayText}>Fetching your location…</Text>
        </View>
      );
    }

    if (permissionDenied) {
      return (
        <View style={styles.mapOverlay}>
          <Text style={styles.mapOverlayText}>Location permission denied. Enable it to show your dot.</Text>
        </View>
      );
    }

    if (markers.length === 0) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Pins appear once addresses are geocoded.</Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Map Preview</Text>
        <Pressable style={styles.fullScreenButton} onPress={() => setIsFullScreen(true)}>
          <Text style={styles.fullScreenButtonText}>Full Screen</Text>
        </Pressable>
      </View>

      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          showsUserLocation
          showsCompass
          showsMyLocationButton
          onPress={({ nativeEvent }) => {
            if (nativeEvent.action !== 'marker-press') {
              setSelectedId(null);
            }
          }}
        >
          {renderMarkers()}
        </MapView>
        {renderOverlay()}
        {renderToast('primary')}
      </View>

      <Modal visible={isFullScreen} animationType="slide" onRequestClose={() => setIsFullScreen(false)}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Map Preview</Text>
            <Pressable style={styles.fullScreenButton} onPress={() => setIsFullScreen(false)}>
              <Text style={styles.fullScreenButtonText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.modalMapWrapper}>
            <MapView
              ref={modalMapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              showsUserLocation
              showsCompass
              showsMyLocationButton
              onPress={({ nativeEvent }) => {
                if (nativeEvent.action !== 'marker-press') {
                  setSelectedId(null);
                }
              }}
            >
              {renderMarkers()}
            </MapView>
            {renderOverlay()}
            {renderToast('modal')}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function extractHouseNumber(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}

function fitToMarkers(map: MapView | null, coords: LatLng[]) {
  if (!map || coords.length === 0) {
    return;
  }

  map.fitToCoordinates(coords, {
    edgePadding: { top: 80, right: 40, bottom: 80, left: 40 },
    animated: true,
  });
}

const styles = StyleSheet.create({
  container: {
    marginTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  fullScreenButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  fullScreenButtonText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  mapWrapper: {
    position: 'relative',
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d4d4d8',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  mapOverlayText: {
    color: '#374151',
    textAlign: 'center',
  },
  notice: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  noticeText: {
    color: '#4338ca',
    textAlign: 'center',
  },
  toastOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  toastContainerFullScreen: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
  },
  toastCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#cbd5f5',
    gap: 12,
  },
  toastLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toastTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  toastStatus: {
    fontSize: 13,
    color: '#475569',
  },
  toastActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  toastButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  toastButtonGhost: {
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  toastButtonGhostText: {
    color: '#475569',
    fontWeight: '600',
  },
  toastButtonPrimary: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  toastButtonPrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  toastButtonDanger: {
    borderColor: '#dc2626',
    backgroundColor: '#fee2e2',
  },
  toastButtonDangerText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    paddingTop: 48,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  modalMapWrapper: {
    flex: 1,
    margin: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d4d4d8',
    overflow: 'hidden',
    position: 'relative',
  },
});

