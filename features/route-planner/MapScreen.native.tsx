import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { useTheme } from '@/features/theme/theme-context';
import type { LatLng, MapPressEvent } from 'react-native-maps';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { Stop } from './types';
import pinBlue from '@/assets/pins/pin-blue.png';
import pinGreen from '@/assets/pins/pin-green.png';
import {
  MARKER_ANCHOR_X,
  MARKER_ANCHOR_Y,
  MARKER_CALLOUT_ANCHOR_X,
  MARKER_CALLOUT_ANCHOR_Y,
} from './marker-icon-cache';
import { useMarkerIconRegistry } from './useMarkerIconRegistry';

const GOOGLE_LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#eeeeee' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#e5e5e5' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#dadada' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#e5e5e5' }],
  },
];

const GOOGLE_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1f2933' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5f5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#2a3646' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#243040' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1b2a3c' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1f2933' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#111827' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#1f2933' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0f172a' }],
  },
];

export type MapScreenProps = {
  pins: Stop[];
  loading?: boolean;
  onCompleteStop?: (stopId: string) => Promise<void> | void;
  onUndoStop?: (stopId: string) => Promise<void> | void;
  onAdjustPin?: (stopId: string) => void;
  onAdjustPinDrag?: (stopId: string, coordinate: LatLng) => Promise<void> | void;
  exitFullScreenSignal?: number;
};

type RouteMarker = {
  id: string;
  coordinate: LatLng;
  address: string | null | undefined;
  label: string;
  status: 'complete' | 'pending';
};

export function MapScreen({
  pins = [],
  loading = false,
  onCompleteStop,
  onUndoStop,
  onAdjustPin,
  exitFullScreenSignal,
  // onAdjustPinDrag exists for feature parity with web; native map remains modal-driven for now.
}: MapScreenProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [didFitMarkers, setDidFitMarkers] = useState(false);
  const [didFitModalMarkers, setDidFitModalMarkers] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const modalMapRef = useRef<MapView | null>(null);
  const mapProvider = PROVIDER_GOOGLE;

  const resolvedMapType = useMemo(() => {
    if (mapType === 'satellite') {
      return 'satellite';
    }
    // Android: stick to standard to avoid provider-specific mapType quirks (mutedStandard is iOS-only).
    if (Platform.OS === 'android') {
      return 'standard';
    }
    return isDark ? 'mutedStandard' : 'standard';
  }, [isDark, mapType]);
  const mapCustomStyle = useMemo(() => {
    if (!mapProvider || mapType !== 'standard') {
      return undefined;
    }
    return isDark ? GOOGLE_DARK_MAP_STYLE : GOOGLE_LIGHT_MAP_STYLE;
  }, [isDark, mapProvider, mapType]);

  useEffect(() => {
    let mounted = true;

    async function requestLocation() {
      try {
        // Check existing permission before asking.
        let perm = await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        let status = perm.status;
        if (status !== 'granted' && perm.canAskAgain) {
          perm = await Location.requestForegroundPermissionsAsync();
          if (!mounted) return;
          status = perm.status;
        }

        if (status === 'granted') {
          setLocationPermissionGranted(true);
          try {
            const position = await Location.getCurrentPositionAsync({});
            if (!mounted) return;
            void position.coords.latitude;
            void position.coords.longitude;
          } catch (error) {
            console.warn('Failed to get current position', error);
          }
        } else {
          setPermissionDenied(true);
          setLocationPermissionGranted(false);
        }
      } catch (error) {
        console.warn('Location permission request failed', error);
        setPermissionDenied(true);
        setLocationPermissionGranted(false);
      }
    }

    requestLocation();
    return () => {
      mounted = false;
    };
  }, []);

  const markers = useMemo<RouteMarker[]>(() => {
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
          status: pin.status === 'complete' ? 'complete' : 'pending',
        };
      });
  }, [pins]);

  const coordinates = useMemo<LatLng[]>(() => markers.map((marker) => marker.coordinate), [markers]);

  useEffect(() => {
    if (!mapReady || coordinates.length === 0 || didFitMarkers) {
      return;
    }
    fitToMarkers(mapRef.current, coordinates);
    setDidFitMarkers(true);
  }, [coordinates, didFitMarkers, mapReady]);

  useEffect(() => {
    if (selectedId && !markers.some((marker) => marker.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, markers]);

  useEffect(() => {
    if (typeof exitFullScreenSignal === 'number') {
      setIsFullScreen(false);
    }
  }, [exitFullScreenSignal]);

  useEffect(() => {
    setConfirmed((prev) => {
      const next = pins.reduce<Record<string, number>>((acc, stop) => {
        if (stop.id && stop.status === 'complete') {
          acc[stop.id] = prev[stop.id] ?? Date.now();
        }
        return acc;
      }, {});

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key])) {
        return prev;
      }
      return next;
    });
  }, [pins]);

  useEffect(() => {
    if (coordinates.length > 0) {
      setDidFitMarkers(false);
      setDidFitModalMarkers(false);
    }
  }, [coordinates.length]);

  const selectedMarker = useMemo(
    () => markers.find((marker) => marker.id === selectedId) ?? null,
    [markers, selectedId]
  );

  const getMarkerStatus = useCallback(
    (marker: RouteMarker): 'complete' | 'pending' =>
      marker.status === 'complete' || confirmed[marker.id] ? 'complete' : 'pending',
    [confirmed]
  );

  const markerVisuals = useMemo(
    () => markers.map((marker) => ({ label: marker.label, status: getMarkerStatus(marker) })),
    [getMarkerStatus, markers]
  );

  const { isPrewarming: isMarkerIconsLoading, getDescriptor } = useMarkerIconRegistry(markerVisuals, {
    debug: __DEV__,
  });

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleConfirm = async (id: string) => {
    if (actioningId) {
      return;
    }
    setActioningId(id);
    setConfirmed((prev) => ({ ...prev, [id]: Date.now() }));
    try {
      await onCompleteStop?.(id);
    } catch (error) {
      console.warn('Failed to mark stop complete', error);
      setConfirmed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } finally {
      setActioningId(null);
    }
    setSelectedId(null);
  };

  const handleUndo = (id: string) => {
    if (actioningId) {
      return;
    }
    Alert.alert('Undo confirmation', 'Are you sure you want to undo this confirmation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          setActioningId(id);
          setConfirmed((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          try {
            await onUndoStop?.(id);
          } catch (error) {
            console.warn('Failed to undo stop completion', error);
            setConfirmed((prev) => ({ ...prev, [id]: Date.now() }));
          } finally {
            setActioningId(null);
          }
          setSelectedId(null);
        },
      },
      ]);
    };

  const renderMarkers = () => {
    if (isMarkerIconsLoading) {
      return null;
    }

    return markers.map((marker) => {
      const status = getMarkerStatus(marker);
      const descriptor = getDescriptor(marker.label, status);
      const fallbackImage = status === 'complete' ? pinGreen : pinBlue;
      const dynamicIconSource = descriptor ? { uri: descriptor.uri } : undefined;
      const markerImageSource = Platform.OS === 'android' ? fallbackImage : dynamicIconSource;
      const markerIconSource = Platform.OS === 'android' ? dynamicIconSource : undefined;

      return (
        <Marker
          key={marker.id}
          coordinate={marker.coordinate}
          anchor={{ x: MARKER_ANCHOR_X, y: MARKER_ANCHOR_Y }}
          calloutAnchor={{ x: MARKER_CALLOUT_ANCHOR_X, y: MARKER_CALLOUT_ANCHOR_Y }}
          onPress={() => handleSelect(marker.id)}
          image={markerImageSource}
          icon={markerIconSource}
          title={marker.label}
          description={marker.address ?? undefined}
        />
      );
    });
  };

  const canAdjustPin = typeof onAdjustPin === 'function';

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
        {isConfirmed ? (
          <Text style={styles.toastStatus}>Snow cleared. Tap undo to revert.</Text>
        ) : null}
      <View style={styles.toastActions}>
        {canAdjustPin ? (
          <Pressable
                style={[styles.toastButton, styles.toastButtonSecondary]}
                onPress={() => {
                  setIsFullScreen(false);
                  onAdjustPin?.(selectedMarker.id);
                }}
              >
                <Text style={styles.toastButtonSecondaryText}>Adjust pin</Text>
              </Pressable>
            ) : null}
              <Pressable style={[styles.toastButton, styles.toastButtonGhost]} onPress={() => setSelectedId(null)}>
                <Text style={styles.toastButtonGhostText}>Close</Text>
              </Pressable>
              {isConfirmed ? (
                <Pressable
                  style={[styles.toastButton, styles.toastButtonDanger]}
                  onPress={() => handleUndo(selectedMarker.id)}
                  disabled={actioningId === selectedMarker.id}
                >
                  <Text style={styles.toastButtonDangerText}>
                    {actioningId === selectedMarker.id ? 'Updating...' : 'Undo'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.toastButton, styles.toastButtonPrimary]}
                  onPress={() => handleConfirm(selectedMarker.id)}
                  disabled={actioningId === selectedMarker.id}
                >
                  <Text style={styles.toastButtonPrimaryText}>
                    {actioningId === selectedMarker.id ? 'Updating...' : 'Snow cleared'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderOverlay = () => {
    if (loading) {
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapOverlayText}>Loading pins...</Text>
        </View>
      );
    }

    if (isMarkerIconsLoading && markers.length > 0) {
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapOverlayText}>Preparing numbered pins...</Text>
        </View>
      );
    }

    if (markers.length === 0) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Pins appear after the locations finish loading.</Text>
        </View>
      );
    }

    if (permissionDenied) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Location permission denied. Map still works; enable it to show your dot.</Text>
        </View>
      );
    }

    return null;
  };

  const renderMapTypeToggle = () => (
    <View style={styles.mapTypeToggle}>
      <Pressable
        style={[styles.mapTypeOption, mapType === 'standard' && styles.mapTypeOptionActive]}
        onPress={() => setMapType('standard')}
      >
        <Text style={[styles.mapTypeOptionText, mapType === 'standard' && styles.mapTypeOptionTextActive]}>
          Map
        </Text>
      </Pressable>
      <Pressable
        style={[styles.mapTypeOption, mapType === 'satellite' && styles.mapTypeOptionActive]}
        onPress={() => setMapType('satellite')}
      >
        <Text style={[styles.mapTypeOptionText, mapType === 'satellite' && styles.mapTypeOptionTextActive]}>
          Satellite
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerActions}>
          {renderMapTypeToggle()}
          <Pressable style={styles.fullScreenButton} onPress={() => setIsFullScreen(true)}>
            <Text style={styles.fullScreenButtonText}>Full Screen</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          provider={mapProvider}
          style={styles.map}
          mapType={resolvedMapType}
          showsUserLocation={locationPermissionGranted}
          showsCompass
          showsMyLocationButton={locationPermissionGranted}
          customMapStyle={mapCustomStyle}
          userInterfaceStyle={isDark ? 'dark' : 'light'}
          onMapReady={() => {
            setMapReady(true);
            if (coordinates.length > 0 && !didFitMarkers) {
              fitToMarkers(mapRef.current, coordinates);
              setDidFitMarkers(true);
            }
          }}
          onPress={(event: MapPressEvent) => {
            if (event.nativeEvent.action !== 'marker-press') {
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
            <View style={styles.modalHeaderActions}>
              {renderMapTypeToggle()}
              <Pressable style={styles.fullScreenButton} onPress={() => setIsFullScreen(false)}>
                <Text style={styles.fullScreenButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.modalMapWrapper}>
            <MapView
              ref={modalMapRef}
              provider={mapProvider}
              style={styles.map}
              mapType={resolvedMapType}
              showsUserLocation={locationPermissionGranted}
              showsCompass
              showsMyLocationButton={locationPermissionGranted}
              customMapStyle={mapCustomStyle}
              userInterfaceStyle={isDark ? 'dark' : 'light'}
              onMapReady={() => {
                if (coordinates.length > 0 && !didFitModalMarkers) {
                  fitToMarkers(modalMapRef.current, coordinates);
                  setDidFitModalMarkers(true);
                }
              }}
              onPress={(event: MapPressEvent) => {
                if (event.nativeEvent.action !== 'marker-press') {
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

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const onPrimary = isDark ? colors.background : colors.surface;
  const overlayBackground = hexToRgba(colors.surface, isDark ? 0.9 : 0.85);
  const toastBackground = hexToRgba(colors.surface, isDark ? 0.9 : 0.96);
  return StyleSheet.create({
    container: {
      marginTop: 48,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginBottom: 12,
      gap: 16,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    fullScreenButton: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    fullScreenButtonText: {
      color: colors.primary,
      fontWeight: '600',
    },
    mapWrapper: {
      position: 'relative',
      height: 320,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    map: {
      flex: 1,
    },
    mapOverlay: {
      position: 'absolute',
      inset: 0,
      backgroundColor: overlayBackground,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    },
    mapOverlayText: {
      color: colors.text,
      textAlign: 'center',
    },
    notice: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 16,
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.primaryMuted,
    },
    noticeText: {
      color: colors.primary,
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
      top: 16,
      alignItems: 'flex-end',
    },
    toastContainerFullScreen: {
      position: 'absolute',
      left: 24,
      right: 24,
      top: 24,
      alignItems: 'flex-end',
    },
    toastCard: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: toastBackground,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
      maxWidth: 360,
    },
    toastLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    toastTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    toastStatus: {
      fontSize: 13,
      color: colors.mutedText,
    },
    toastActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: 12,
    },
    toastButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
    },
    toastButtonGhost: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    toastButtonGhostText: {
      color: colors.mutedText,
      fontWeight: '600',
    },
    toastButtonPrimary: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    toastButtonPrimaryText: {
      color: onPrimary,
      fontWeight: '600',
    },
    toastButtonSecondary: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    toastButtonSecondaryText: {
      color: colors.primary,
      fontWeight: '600',
    },
    toastButtonDanger: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerMuted,
    },
    toastButtonDangerText: {
      color: colors.danger,
      fontWeight: '600',
    },
    modalContent: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    modalHeader: {
      paddingTop: 48,
      paddingHorizontal: 24,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 16,
    },
    modalHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalMapWrapper: {
      flex: 1,
      margin: 24,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      position: 'relative',
    },
    mapTypeToggle: {
      flexDirection: 'row',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      width: 160,
    },
    mapTypeOption: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapTypeOptionActive: {
      backgroundColor: colors.primary,
    },
    mapTypeOptionText: {
      fontWeight: '600',
      color: colors.mutedText,
    },
    mapTypeOptionTextActive: {
      color: onPrimary,
    },
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

function parseHex(input: string): [number, number, number] {
  const value = input.trim().replace(/^#/, '');
  const normalized = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (normalized.length !== 6 || /[^0-9a-f]/i.test(normalized)) {
    console.warn(`Invalid hex color "${input}", defaulting to black.`);
    return [0, 0, 0];
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}
