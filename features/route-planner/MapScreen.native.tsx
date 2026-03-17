import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/features/theme/theme-context';
import type { LatLng, MapPressEvent } from 'react-native-maps';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { Stop } from './types';
import pinBlue from '@/assets/pins/pin-blue.png';
import pinGreen from '@/assets/pins/pin-green.png';
import {
  MARKER_ANCHOR_X,
  MARKER_ANCHOR_Y,
  MARKER_CALLOUT_ANCHOR_X,
  MARKER_CALLOUT_ANCHOR_Y,
  normalizeMarkerLabel,
  type AndroidPinTheme,
} from './marker-icon-cache';
import { useAndroidPinIconRegistry } from './useAndroidPinIconRegistry';
import { useAndroidFusedLocationController } from './useAndroidFusedLocationController';

const GOOGLE_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0b1220' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1220' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#334155' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#172033' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#111827' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#132235' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1f2937' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#374151' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#273449' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#334155' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#475569' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#e5e7eb' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0b2545' }],
  },
];

export type MapScreenProps = {
  pins: Stop[];
  loading?: boolean;
  onCompleteStop?: (stopId: string) => Promise<void> | void;
  onUndoStop?: (stopId: string) => Promise<void> | void;
  onAdjustPin?: (stopId: string) => void;
  onCloseMap?: () => void;
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
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets.top), [colors, isDark, insets.top]);
  const isAndroid = Platform.OS === 'android';
  const {
    start: restartAndroidLocation,
    state: androidLocation,
    hasFix: hasAndroidLocationFix,
    isPrecise: isAndroidLocationPrecise,
  } = useAndroidFusedLocationController();
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
  const useNativeUserLocationLayer = !isAndroid;

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
    if (!mapProvider || mapType !== 'standard' || !isDark) {
      return undefined;
    }
    return GOOGLE_DARK_MAP_STYLE;
  }, [isDark, mapProvider, mapType]);

  const renderOverlay = () => {
    if (loading) {
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapOverlayText}>Loading pins...</Text>
        </View>
      );
    }

    if (Platform.OS === 'android' && isAndroidPinPrewarming && markers.length > 0) {
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapOverlayText}>Setting up the map...</Text>
        </View>
      );
    }

    if (markers.length === 0) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Pins will appear once addresses are loaded.</Text>
        </View>
      );
    }

    if (isAndroid) {
      if (androidLocation.status === 'denied') {
        return (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Permission denied.</Text>
            <Pressable style={styles.noticeAction} onPress={() => void restartAndroidLocation()}>
              <Text style={styles.noticeActionText}>Retry location</Text>
            </Pressable>
          </View>
        );
      }

      if (androidLocation.status === 'settings_required' || androidLocation.status === 'unavailable') {
        return (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{androidLocation.message ?? 'Please enable GPS in your device settings.'}</Text>
            <Pressable style={styles.noticeAction} onPress={() => void restartAndroidLocation()}>
              <Text style={styles.noticeActionText}>Enable GPS</Text>
            </Pressable>
          </View>
        );
      }

      if (androidLocation.status === 'error') {
        return (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{androidLocation.message ?? 'Couldn\'t get your location. Tap to try again.'}</Text>
            <Pressable style={styles.noticeAction} onPress={() => void restartAndroidLocation()}>
              <Text style={styles.noticeActionText}>Retry location</Text>
            </Pressable>
          </View>
        );
      }

      if (androidLocation.isLocating && !hasAndroidLocationFix) {
        return (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Locating...</Text>
          </View>
        );
      }

      if (hasAndroidLocationFix && !isAndroidLocationPrecise) {
        return (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Getting a more accurate location...</Text>
          </View>
        );
      }
    }

    return null;
  };

  const renderFallbackUserLocation = () => {
    if (!isAndroid || !hasAndroidLocationFix || !androidLocation.coords) {
      return null;
    }

    const radius = Math.max(androidLocation.accuracyM ?? 30, 30);

    return (
      <>
        {!isAndroidLocationPrecise ? (
          <Circle
            center={{ latitude: androidLocation.coords.lat, longitude: androidLocation.coords.lng }}
            radius={radius}
            strokeColor="rgba(37, 99, 235, 0.45)"
            fillColor="rgba(37, 99, 235, 0.18)"
            strokeWidth={1}
          />
        ) : null}
        <Marker
          coordinate={{ latitude: androidLocation.coords.lat, longitude: androidLocation.coords.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.fallbackDotOuter}>
            <View style={styles.fallbackDotInner} />
          </View>
        </Marker>
      </>
    );
  };
  const markers = useMemo<RouteMarker[]>(() => {
    return pins
      .filter((pin): pin is Stop & { lat: number; lng: number } => typeof pin.lat === 'number' && typeof pin.lng === 'number')
      .map((pin, index) => {
        const label =
          typeof pin.label === 'string' && pin.label.trim().length > 0
            ? pin.label.trim()
            : extractAddressToken(pin.address) ?? String(index + 1);

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

  const androidTheme: AndroidPinTheme = isDark ? 'dark' : 'light';
  const androidVisuals = useMemo(
    () =>
      Platform.OS === 'android'
        ? markers.map((marker) => ({
            label: marker.label,
            status: getMarkerStatus(marker),
            theme: androidTheme,
          }))
        : [],
    [androidTheme, getMarkerStatus, markers]
  );
  const {
    isPrewarming: isAndroidPinPrewarming,
    getIconUri,
  } = useAndroidPinIconRegistry(androidVisuals, {
    concurrency: 2,
    debug: __DEV__,
  });

  useEffect(() => {
    if (isFullScreen) {
      // Fullscreen map remounts each open; force a fresh fit pass.
      setDidFitModalMarkers(false);
      return;
    }

    // Inline map is unmounted while fullscreen is open on Android. Reset fit state on return.
    setMapReady(false);
    setDidFitMarkers(false);
  }, [isFullScreen]);

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
      if (__DEV__) console.warn('Failed to mark stop complete', error);
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
            if (__DEV__) console.warn('Failed to undo stop completion', error);
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
    if (Platform.OS === 'android' && isAndroidPinPrewarming) {
      return null;
    }

    return markers.map((marker) => {
      const status = getMarkerStatus(marker);
      const label = normalizeMarkerLabel(marker.label) || marker.label;
      const pinSource = status === 'complete' ? pinGreen : pinBlue;
      const iconUri = getIconUri(marker.label, status, androidTheme);

      if (Platform.OS === 'android') {
        return (
          <Marker
            key={`${marker.id}:${status}`}
            coordinate={marker.coordinate}
            anchor={{ x: MARKER_ANCHOR_X, y: MARKER_ANCHOR_Y }}
            calloutAnchor={{ x: MARKER_CALLOUT_ANCHOR_X, y: MARKER_CALLOUT_ANCHOR_Y }}
            onPress={() => handleSelect(marker.id)}
            image={iconUri ? { uri: iconUri } : pinSource}
            title={marker.label}
            description={marker.address ?? undefined}
          />
        );
      }

      return (
        <Marker
          key={`${marker.id}:${status}`}
          coordinate={marker.coordinate}
          anchor={{ x: MARKER_ANCHOR_X, y: MARKER_ANCHOR_Y }}
          calloutAnchor={{ x: MARKER_CALLOUT_ANCHOR_X, y: MARKER_CALLOUT_ANCHOR_Y }}
          onPress={() => handleSelect(marker.id)}
          tracksViewChanges={false}
          title={marker.label}
          description={marker.address ?? undefined}
        >
          <View style={styles.markerContainer} collapsable={false}>
            <Image source={pinSource} style={styles.markerImage} resizeMode="contain" />
            <Text style={styles.markerLabel} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </Marker>
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
          <Text style={styles.toastStatus}>Marked as cleared. Tap Undo to change it back.</Text>
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
                    {actioningId === selectedMarker.id ? 'Updating...' : 'Mark cleared'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    );
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
        {!isFullScreen ? (
          <>
            <MapView
              ref={mapRef}
              provider={mapProvider}
              style={styles.map}
              mapType={resolvedMapType}
              showsUserLocation={useNativeUserLocationLayer}
              showsCompass
              showsMyLocationButton={useNativeUserLocationLayer}
              showsBuildings
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
              {renderFallbackUserLocation()}
              {renderMarkers()}
            </MapView>
            {renderOverlay()}
            {renderToast('primary')}
          </>
        ) : null}
      </View>

      <Modal visible={isFullScreen} animationType="slide" onRequestClose={() => setIsFullScreen(false)}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderActions}>
              {renderMapTypeToggle()}
              <Pressable style={styles.fullScreenButton} onPress={() => setIsFullScreen(false)} accessibilityRole="button" accessibilityLabel="Close full screen map">
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
              showsUserLocation={useNativeUserLocationLayer}
              showsCompass
              showsMyLocationButton={useNativeUserLocationLayer}
              showsBuildings
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
              {renderFallbackUserLocation()}
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

function extractAddressToken(address: string | null | undefined): string | null {
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

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean, topInset: number = 48) {
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
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: 'center' as const,
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
    noticeAction: {
      alignSelf: 'center',
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: 'center' as const,
      backgroundColor: colors.surface,
    },
    noticeActionText: {
      color: colors.primary,
      fontWeight: '700',
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
      paddingTop: topInset + 8,
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
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 44,
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
    markerContainer: {
      width: 44,
      height: 56,
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    markerImage: {
      width: 44,
      height: 56,
    },
    markerLabel: {
      position: 'absolute',
      top: 13,
      width: 30,
      textAlign: 'center',
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
      includeFontPadding: false,
      lineHeight: 14,
    },
    fallbackDotOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(37, 99, 235, 0.3)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.85)',
    },
    fallbackDotInner: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: '#2563eb',
      borderWidth: 1,
      borderColor: '#ffffff',
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
    if (__DEV__) console.warn(`Invalid hex color "${input}", defaulting to black.`);
    return [0, 0, 0];
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}
