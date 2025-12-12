import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { useTheme } from '@/features/theme/theme-context';
import type MapView from 'react-native-maps';
import type { LatLng, MapPressEvent } from 'react-native-maps';
import type { Stop } from './types';

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

type UserLocation = {
  latitude: number;
  longitude: number;
};

type MapModule = typeof import('react-native-maps') | null;

export function MapScreen({
  pins,
  loading = false,
  onCompleteStop,
  onUndoStop,
  onAdjustPin,
  exitFullScreenSignal,
  // onAdjustPinDrag exists for feature parity with web; native map remains modal-driven for now.
}: MapScreenProps) {
  // Expo Go does not bundle react-native-maps. Load at runtime so we can fall back gracefully.
  const mapModule = useMemo<MapModule>(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('react-native-maps');
    } catch (error) {
      console.warn('react-native-maps unavailable; rendering fallback map view', error);
      return null;
    }
  }, []);

  const MapViewComponent = mapModule?.default ?? null;
  // For now, bypass custom MarkerBadge and use default markers to validate native rendering.
  const MarkerComponent = mapModule?.Marker ?? null;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [modalMapReady, setModalMapReady] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const modalMapRef = useRef<MapView | null>(null);
  const mapProvider = useMemo(
    () => (mapModule && supportsGoogleMapsProvider(mapModule) ? mapModule.PROVIDER_GOOGLE : undefined),
    [mapModule]
  );

  const resolvedMapType = mapType === 'satellite' ? 'satellite' : isDark ? 'mutedStandard' : 'standard';
  const mapCustomStyle = useMemo(() => {
    if (!mapProvider || mapType !== 'standard') {
      return undefined;
    }
    return isDark ? GOOGLE_DARK_MAP_STYLE : GOOGLE_LIGHT_MAP_STYLE;
  }, [isDark, mapProvider, mapType]);

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
          status: pin.status === 'complete' ? 'complete' : 'pending',
        };
      });
  }, [pins]);

  const coordinates = useMemo<LatLng[]>(() => markers.map((marker) => marker.coordinate), [markers]);

  useEffect(() => {
    if (!mapReady || coordinates.length === 0) {
      return;
    }
    fitToMarkers(mapRef.current, coordinates);
  }, [coordinates, mapReady]);

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

  const selectedMarker = useMemo(
    () => markers.find((marker) => marker.id === selectedId) ?? null,
    [markers, selectedId]
  );

  const selectedMixTarget = isDark ? colors.text : colors.surface;
  const selectedMixAmount = isDark ? 0.35 : 0.55;
  const pinColor = colors.primary;
  const confirmedColor = colors.success;
  const selectedPinColor = useMemo(
    () => mixHexColor(pinColor, selectedMixTarget, selectedMixAmount),
    [pinColor, selectedMixTarget, selectedMixAmount]
  );
  const selectedConfirmedPinColor = useMemo(
    () => mixHexColor(confirmedColor, selectedMixTarget, selectedMixAmount),
    [confirmedColor, selectedMixTarget, selectedMixAmount]
  );
  const badgeLabelColor = isDark ? colors.text : colors.surface;
  const badgeBorderColor = isDark ? colors.text : colors.surface;

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
    if (!MarkerComponent) {
      return null;
    }
    return markers.map((marker) => (
      <MarkerComponent
        key={marker.id}
        coordinate={marker.coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        calloutAnchor={{ x: 0.5, y: 0 }}
        tracksViewChanges
        onPress={() => handleSelect(marker.id)}
      >
        <View style={styles.inlineMarkerOuter}>
          <View
            style={[
              styles.inlineMarker,
              Platform.OS === 'android' && styles.inlineMarkerAndroid,
              {
                backgroundColor:
                  marker.status === 'complete' || confirmed[marker.id] ? colors.success : colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.inlineMarkerText,
                Platform.OS === 'android' && styles.inlineMarkerTextAndroid,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {Platform.OS === 'android' ? (marker.label ?? '').slice(0, 4) : marker.label}
            </Text>
          </View>
        </View>
      </MarkerComponent>
    ));
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
                    {actioningId === selectedMarker.id ? 'Updating???' : 'Undo'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.toastButton, styles.toastButtonPrimary]}
                  onPress={() => handleConfirm(selectedMarker.id)}
                  disabled={actioningId === selectedMarker.id}
                >
                  <Text style={styles.toastButtonPrimaryText}>
                    {actioningId === selectedMarker.id ? 'Updating???' : 'Snow cleared'}
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
    if (loading && !requestingLocation) {
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapOverlayText}>Loading pins???</Text>
        </View>
      );
    }

    if (requestingLocation) {
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapOverlayText}>Fetching your location???</Text>
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
          <Text style={styles.noticeText}>Pins appear after the locations finish loading.</Text>
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

  if (!MapViewComponent) {
    return (
      <View style={[styles.container, styles.fallbackContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={[styles.fallbackTitle, { color: colors.text }]}>Map unavailable in Expo Go</Text>
        <Text style={[styles.fallbackBody, { color: colors.mutedText }]}>
          The native Google Maps module (react-native-maps) is not bundled in Expo Go. Use a custom dev client or
          production build to view the interactive map. Showing pinned stops below for reference.
        </Text>
        {pins.length === 0 ? (
          <Text style={{ color: colors.mutedText }}>No pins yet.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {pins.map((pin, index) => (
              <View
                key={pin.id ?? index}
                style={[styles.fallbackRow, { borderColor: colors.border }]}
              >
                <Text style={[styles.fallbackBadge, { color: colors.primary }]}>{index + 1}</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.fallbackAddress, { color: colors.text }]} numberOfLines={2}>
                    {pin.address}
                  </Text>
                  <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                    {typeof pin.lat === 'number' && typeof pin.lng === 'number'
                      ? `(${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)})`
                      : 'No coordinates yet'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

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
        <MapViewComponent
          ref={mapRef}
          provider={mapProvider}
          style={styles.map}
          mapType={resolvedMapType}
          showsUserLocation
          showsCompass
          showsMyLocationButton
          customMapStyle={mapCustomStyle}
          userInterfaceStyle={isDark ? 'dark' : 'light'}
          onMapReady={() => {
            setMapReady(true);
            if (coordinates.length > 0) {
              fitToMarkers(mapRef.current, coordinates);
            }
          }}
          onPress={(event: MapPressEvent) => {
            if (event.nativeEvent.action !== 'marker-press') {
              setSelectedId(null);
            }
          }}
        >
          {renderMarkers()}
        </MapViewComponent>
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
            <MapViewComponent
              ref={modalMapRef}
              provider={mapProvider}
              style={styles.map}
              mapType={resolvedMapType}
              showsUserLocation
              showsCompass
              showsMyLocationButton
              customMapStyle={mapCustomStyle}
              userInterfaceStyle={isDark ? 'dark' : 'light'}
              onMapReady={() => {
                setModalMapReady(true);
                if (coordinates.length > 0) {
                  fitToMarkers(modalMapRef.current, coordinates);
                }
              }}
              onPress={(event: MapPressEvent) => {
                if (event.nativeEvent.action !== 'marker-press') {
                  setSelectedId(null);
                }
              }}
            >
              {renderMarkers()}
            </MapViewComponent>
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
    inlineMarker: {
      width: 40,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineMarkerOuter: {
      overflow: 'visible',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineMarkerAndroid: {
      width: 'auto',
      minWidth: 64,
      paddingHorizontal: 12,
      height: 32,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    inlineMarkerComplete: {
      backgroundColor: colors.success,
    },
    inlineMarkerText: {
      color: colors.surface,
      fontWeight: '700',
      fontSize: 12,
    },
    inlineMarkerTextAndroid: {
      fontSize: 11,
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
    fallbackContainer: {
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
    },
    fallbackTitle: {
      fontSize: 16,
      fontWeight: '600',
    },
    fallbackBody: {
      fontSize: 14,
      lineHeight: 20,
    },
    fallbackRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    fallbackBadge: {
      width: 26,
      textAlign: 'center',
      fontWeight: '700',
    },
    fallbackAddress: {
      fontSize: 14,
      fontWeight: '500',
    },
  });
}

function mixHexColor(base: string, mix: string, ratio: number): string {
  const amount = Math.max(0, Math.min(1, ratio));
  const [br, bg, bb] = parseHex(base);
  const [mr, mg, mb] = parseHex(mix);
  const r = Math.round(br + (mr - br) * amount);
  const g = Math.round(bg + (mg - bg) * amount);
  const b = Math.round(bb + (mb - bb) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

function parseHex(input: string): [number, number, number] {
  const value = input.trim().replace(/^#/, '');
  if (value.length !== 6) {
    throw new Error(`Expected 6-digit hex color, received: ${input}`);
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

function supportsGoogleMapsProvider(mapModule: MapModule): boolean {
  if (Platform.OS === 'android') {
    return Boolean(mapModule?.default);
  }
  if (Platform.OS !== 'ios') {
    return false;
  }

  // AIRGoogleMap exists only when the Google Maps SDK is linked on iOS.
  try {
    if (typeof UIManager.getViewManagerConfig === 'function') {
      return Boolean(UIManager.getViewManagerConfig('AIRGoogleMap'));
    }
    if (typeof UIManager.hasViewManagerConfig === 'function') {
      return UIManager.hasViewManagerConfig('AIRGoogleMap');
    }
  } catch (error) {
    console.warn('Unable to detect Google Maps provider; falling back to Apple Maps.', error);
  }
  return false;
}
