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

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/features/theme/theme-context';
import type { LatLng, MapPressEvent } from 'react-native-maps';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { Stop } from './types';
import { useAndroidFusedLocationController } from './useAndroidFusedLocationController';

const GOOGLE_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0b1220' }] },
  { elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#f8fafc' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#020617' }, { weight: 4 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  {
    featureType: 'administrative',
    elementType: 'labels',
    stylers: [{ visibility: 'on' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#fde68a' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#020617' }, { weight: 5 }],
  },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#e2e8f0' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels',
    stylers: [{ visibility: 'on' }],
  },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#172033' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#dbeafe' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#132235' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#273449' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#374151' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#020617' }, { weight: 5 }],
  },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#273449' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#475569' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b2545' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#bae6fd' }] },
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
}: MapScreenProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, isDark, insets.top, insets.bottom),
    [colors, isDark, insets.bottom, insets.top]
  );
  const isAndroid = Platform.OS === 'android';

  const [isOpen, setIsOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [trackMarkerChanges, setTrackMarkerChanges] = useState(isAndroid);

  const mapRef = useRef<MapView | null>(null);
  const didFitRef = useRef(false);
  const markerTrackingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adjustPinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAdjustPinRef = useRef<string | null>(null);
  const locationController = useAndroidFusedLocationController({ autoStart: false });
  const driverLocation = locationController.state.coords;

  useEffect(() => {
    if (!isOpen || !mapReady) {
      void locationController.stop();
      return;
    }
    void locationController.start();
  }, [isOpen, locationController.start, locationController.stop, mapReady]);

  // Use Apple Maps on iOS (no API key needed), Google Maps on Android
  const mapProvider = isAndroid ? PROVIDER_GOOGLE : undefined;
  const resolvedMapType = useMemo(() => {
    if (mapType === 'satellite') return 'satellite';
    if (isAndroid) return 'standard';
    return isDark ? 'mutedStandard' : 'standard';
  }, [isDark, mapType, isAndroid]);

  const mapCustomStyle = useMemo(() => {
    // Only apply custom dark style on Android (Google Maps). Apple Maps handles dark mode natively.
    if (!isAndroid || mapType !== 'standard' || !isDark) return undefined;
    return GOOGLE_DARK_MAP_STYLE;
  }, [isDark, mapType, isAndroid]);

  const markers = useMemo<RouteMarker[]>(() => {
    return pins
      .map((pin) => ({
        pin,
        lat: typeof pin.lat === 'number' ? pin.lat : Number(pin.lat),
        lng: typeof pin.lng === 'number' ? pin.lng : Number(pin.lng),
      }))
      .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng))
      .map(({ pin, lat, lng }, index) => {
        const label =
          typeof pin.label === 'string' && pin.label.trim().length > 0
            ? pin.label.trim()
            : extractHouseNumber(pin.address) ?? String(index + 1);
        return {
          id: pin.id ?? String(index),
          coordinate: { latitude: lat, longitude: lng } as LatLng,
          address: pin.address,
          label,
          status: pin.status === 'complete' ? 'complete' : 'pending',
        };
      });
  }, [pins]);

  const coordinates = useMemo<LatLng[]>(() => markers.map((m) => m.coordinate), [markers]);

  const selectedMarker = useMemo(
    () => markers.find((m) => m.id === selectedId) ?? null,
    [markers, selectedId]
  );

  const getMarkerStatus = useCallback(
    (marker: RouteMarker): 'complete' | 'pending' =>
      marker.status === 'complete' || confirmed[marker.id] ? 'complete' : 'pending',
    [confirmed]
  );

  // Sync confirmed state with pin statuses
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
      if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key])) return prev;
      return next;
    });
  }, [pins]);

  // Reset selection when markers change
  useEffect(() => {
    if (selectedId && !markers.some((m) => m.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, markers]);

  // Handle external close signal
  useEffect(() => {
    if (typeof exitFullScreenSignal === 'number') {
      setIsOpen(false);
    }
  }, [exitFullScreenSignal]);

  // Reset fit when map reopens or markers change
  useEffect(() => {
    didFitRef.current = false;
  }, [isOpen, coordinates.length]);

  const refreshMarkerSnapshots = useCallback(() => {
    if (!isAndroid) return;
    if (markerTrackingTimerRef.current) {
      clearTimeout(markerTrackingTimerRef.current);
    }
    setTrackMarkerChanges(true);
    markerTrackingTimerRef.current = setTimeout(() => {
      setTrackMarkerChanges(false);
      markerTrackingTimerRef.current = null;
    }, 1500);
  }, [isAndroid]);

  useEffect(() => {
    if (!isOpen || markers.length === 0) return;
    refreshMarkerSnapshots();
    return () => {
      if (markerTrackingTimerRef.current) {
        clearTimeout(markerTrackingTimerRef.current);
        markerTrackingTimerRef.current = null;
      }
    };
  }, [confirmed, isOpen, markers, refreshMarkerSnapshots, selectedId]);

  useEffect(() => {
    return () => {
      if (adjustPinTimerRef.current) {
        clearTimeout(adjustPinTimerRef.current);
        adjustPinTimerRef.current = null;
      }
    };
  }, []);

  const fitToMarkers = useCallback((map: MapView | null, force = false, animated = false) => {
    if (!map || coordinates.length === 0 || (!force && didFitRef.current)) return;
    map.fitToCoordinates(coordinates, {
      edgePadding: { top: 80, right: 40, bottom: 120, left: 40 },
      // A first-frame animation can fight a pinch gesture started while the
      // map is opening. Fit once, immediately, then leave the camera entirely
      // under the user's control.
      animated,
    });
    didFitRef.current = true;
  }, [coordinates]);

  const handleShowAllStops = useCallback(() => {
    setSelectedId(null);
    fitToMarkers(mapRef.current, true, true);
  }, [fitToMarkers]);

  const handleShowDriver = useCallback(() => {
    if (!driverLocation || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      500
    );
  }, [driverLocation]);

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleConfirm = async (id: string) => {
    if (actioningId) return;
    setActioningId(id);
    // Dismiss the selected-stop card before the parent refreshes the stop and
    // the native marker changes from pending to complete. Updating both native
    // map children in the same frame was crashing iOS in this flow.
    setSelectedId(null);
    try {
      await onCompleteStop?.(id);
      setConfirmed((prev) => ({ ...prev, [id]: Date.now() }));
    } catch {
      // Keep the pin pending when the server update fails.
    } finally {
      setActioningId(null);
    }
  };

  const handleUndo = (id: string) => {
    if (actioningId) return;
    Alert.alert('Undo?', 'This will mark the stop as not cleared. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          setActioningId(id);
          setConfirmed((prev) => { const next = { ...prev }; delete next[id]; return next; });
          try {
            await onUndoStop?.(id);
          } catch {
            setConfirmed((prev) => ({ ...prev, [id]: Date.now() }));
          } finally {
            setActioningId(null);
          }
          setSelectedId(null);
        },
      },
    ]);
  };

  const canAdjustPin = typeof onAdjustPin === 'function';

  const stopCount = markers.length;
  const clearedCount = markers.filter((m) => getMarkerStatus(m) === 'complete').length;

  // Button to open map (matches web pattern)
  if (!isOpen) {
    return (
      <View style={styles.closedContainer}>
        <Pressable
          style={({ pressed }) => [styles.openButton, pressed && styles.openButtonPressed]}
          onPress={() => {
            setMapReady(false);
            setIsOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open map"
        >
          <Text style={styles.openButtonText}>
            {loading
              ? 'Loading...'
              : stopCount === 0
              ? 'Open map'
              : `Open map (${clearedCount}/${stopCount} cleared)`}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => setIsOpen(false)}
      onDismiss={() => {
        const stopId = pendingAdjustPinRef.current;
        if (Platform.OS === 'ios' && stopId) {
          pendingAdjustPinRef.current = null;
          onAdjustPin?.(stopId);
        }
      }}
    >
      <View style={styles.fullscreen}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.mapTypeToggle}>
              <Pressable
                style={[styles.mapTypeOption, mapType === 'standard' && styles.mapTypeOptionActive]}
                onPress={() => setMapType('standard')}
              >
                <Text style={[styles.mapTypeText, mapType === 'standard' && styles.mapTypeTextActive]}>Map</Text>
              </Pressable>
              <Pressable
                style={[styles.mapTypeOption, mapType === 'satellite' && styles.mapTypeOptionActive]}
                onPress={() => setMapType('satellite')}
              >
                <Text style={[styles.mapTypeText, mapType === 'satellite' && styles.mapTypeTextActive]}>Satellite</Text>
              </Pressable>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                style={styles.showAllButton}
                onPress={handleShowAllStops}
                accessibilityRole="button"
                accessibilityLabel="Show all stops on map"
              >
                <Text style={styles.showAllButtonText}>All stops</Text>
              </Pressable>
              <Pressable
                style={styles.closeButton}
                onPress={() => {
                  setMapReady(false);
                  setIsOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close map"
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          {loading ? (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.overlayText}>Loading map...</Text>
            </View>
          ) : markers.length === 0 ? (
            <View style={styles.overlay}>
              <Text style={styles.overlayText}>No locations to show yet. Load addresses to see them on the map.</Text>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              provider={mapProvider}
              style={styles.map}
              mapType={resolvedMapType}
              showsUserLocation={Boolean(driverLocation)}
              showsCompass
              showsMyLocationButton
              showsBuildings
              zoomEnabled
              zoomControlEnabled={isAndroid}
              scrollEnabled
              rotateEnabled={false}
              pitchEnabled={false}
              scrollDuringRotateOrZoomEnabled={false}
              moveOnMarkerPress={false}
              minZoomLevel={2}
              maxZoomLevel={20}
              customMapStyle={mapCustomStyle}
              userInterfaceStyle={isDark ? 'dark' : 'light'}
              onMapReady={() => {
                refreshMarkerSnapshots();
                fitToMarkers(mapRef.current);
                setMapReady(true);
              }}
              onPress={(event: MapPressEvent) => {
                if (event.nativeEvent.action !== 'marker-press') {
                  setSelectedId(null);
                }
              }}
            >
              {driverLocation ? (
                <Marker
                  coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
                  accessibilityLabel="Your location"
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  onPress={handleShowDriver}
                >
                  <View style={styles.driverLocationMarker}>
                    <View style={styles.driverLocationDot} />
                  </View>
                </Marker>
              ) : null}
              {markers.map((marker) => {
                const status = getMarkerStatus(marker);
                const isComplete = status === 'complete';
                const isSelected = marker.id === selectedId;
                return (
                  <Marker
                    // Keep the native marker instance stable while selection
                    // changes. Remounting a custom marker on every tap can
                    // make its snapshot disappear and has caused iOS crashes
                    // when the selected-stop card is dismissed.
                    key={marker.id}
                    coordinate={marker.coordinate}
                    onPress={() => handleSelect(marker.id)}
                    anchor={{ x: 0.5, y: 0.5 }}
                    // Android uses short-lived snapshots for performance;
                    // iOS keeps the view live so selected-state styling is
                    // rendered without replacing the native marker.
                    tracksViewChanges={isAndroid ? trackMarkerChanges : true}
                  >
                    <View
                      collapsable={false}
                      style={[styles.pinSnapshotFrame, { width: getPinWidth(marker.label) }]}
                    >
                      <View
                        style={[
                          styles.pin,
                          { width: getPinWidth(marker.label) },
                          isComplete ? styles.pinComplete : styles.pinPending,
                          isSelected && styles.pinSelected,
                        ]}
                      >
                        <Text
                          style={[styles.pinLabel, marker.label.length >= 8 && styles.pinLabelCompact]}
                          numberOfLines={1}
                        >
                          {marker.label}
                        </Text>
                      </View>
                    </View>
                  </Marker>
                );
              })}
            </MapView>
          )}
          {markers.length > 0 && (
            <View style={styles.locationStatus} pointerEvents="box-none">
              {driverLocation ? (
                <Pressable
                  style={styles.locationButton}
                  onPress={handleShowDriver}
                  accessibilityRole="button"
                  accessibilityLabel="Show my location"
                >
                  <Text style={styles.locationButtonText}>My location</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.locationNotice}
                  onPress={() => void locationController.start()}
                  accessibilityRole="button"
                  accessibilityLabel="Enable location"
                >
                  <Text style={styles.locationNoticeText}>
                    {!mapReady ? 'Preparing map…' : locationController.state.message || 'Locating…'}
                  </Text>
                  {mapReady && ['denied', 'settings_required', 'unavailable', 'error'].includes(
                    locationController.state.status
                  ) ? <Text style={styles.locationRetryText}>Tap to retry</Text> : null}
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Selected stop card */}
        {selectedMarker ? (
          <View style={styles.stopCard}>
            <View style={styles.stopCardHeader}>
              <Text style={styles.stopCardLabel}>{selectedMarker.label}</Text>
              <Text style={styles.stopCardAddress} numberOfLines={2}>
                {selectedMarker.address || 'Address unavailable'}
              </Text>
            </View>
            {Boolean(confirmed[selectedMarker.id]) && (
              <Text style={styles.stopCardStatus}>Marked as cleared. Tap Undo to change it back.</Text>
            )}
            <View style={styles.stopCardActions}>
              {canAdjustPin && (
                <Pressable
                  style={[styles.actionButton, styles.actionSecondary]}
                  onPress={() => {
                    const stopId = selectedMarker.id;
                    setSelectedId(null);
                    setIsOpen(false);
                    pendingAdjustPinRef.current = stopId;
                    if (Platform.OS === 'ios') return;
                    // Let the map modal finish unmounting before the editor
                    // mounts its own native MapView on Android.
                    adjustPinTimerRef.current = setTimeout(() => {
                      adjustPinTimerRef.current = null;
                      pendingAdjustPinRef.current = null;
                      onAdjustPin?.(stopId);
                    }, 300);
                  }}
                >
                  <Text style={styles.actionSecondaryText}>Adjust pin</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.actionButton, styles.actionGhost]}
                onPress={() => setSelectedId(null)}
              >
                <Text style={styles.actionGhostText}>Close</Text>
              </Pressable>
              {Boolean(confirmed[selectedMarker.id]) ? (
                <Pressable
                  style={[styles.actionButton, styles.actionDanger]}
                  onPress={() => handleUndo(selectedMarker.id)}
                  disabled={actioningId === selectedMarker.id}
                >
                  <Text style={styles.actionDangerText}>
                    {actioningId === selectedMarker.id ? 'Updating...' : 'Undo'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.actionButton, styles.actionPrimary]}
                  onPress={() => handleConfirm(selectedMarker.id)}
                  disabled={actioningId === selectedMarker.id}
                >
                  <Text style={styles.actionPrimaryText}>
                    {actioningId === selectedMarker.id ? 'Updating...' : 'Mark cleared'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function extractHouseNumber(address: string | null | undefined): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  const range = trimmed.match(/^(\d+[A-Za-z]?)\s*[-\u2010-\u2015]\s*(\d+[A-Za-z]?)(?=\s|,|$)/);
  if (range) return `${range[1]}-${range[2]}`;
  const match = trimmed.match(/^(\d+[A-Za-z0-9]*)\b/);
  return match ? match[1] : null;
}

function getPinWidth(label: string): number {
  // Keep the complete civic number visible, including ranges such as
  // "202-207", without allowing unusually long labels to dominate the map.
  return Math.min(92, Math.max(30, label.length * 8 + 14));
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean,
  topInset: number = 48,
  bottomInset: number = 0
) {
  const onPrimary = isDark ? colors.background : colors.surface;
  return StyleSheet.create({
    // Closed state — just the open button
    closedContainer: {
      marginTop: 24,
    },
    openButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    openButtonPressed: {
      opacity: 0.85,
    },
    openButtonText: {
      color: onPrimary,
      fontSize: 16,
      fontWeight: '700',
    },

    // Fullscreen modal
    fullscreen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      paddingTop: topInset + 8,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    mapTypeToggle: {
      flexDirection: 'row',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    mapTypeOption: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 44,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapTypeOptionActive: {
      backgroundColor: colors.primary,
    },
    mapTypeText: {
      fontWeight: '600',
      color: colors.mutedText,
    },
    mapTypeTextActive: {
      color: onPrimary,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    showAllButton: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
      borderRadius: 999,
      backgroundColor: colors.primary,
      justifyContent: 'center',
    },
    showAllButtonText: {
      color: onPrimary,
      fontWeight: '700',
      fontSize: 13,
    },
    closeButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 44,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    closeButtonText: {
      color: colors.text,
      fontWeight: '700',
    },

    // Map area
    mapContainer: {
      flex: 1,
    },
    map: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    },
    overlayText: {
      color: colors.text,
      textAlign: 'center',
      fontSize: 15,
    },
    locationStatus: {
      elevation: 10,
      position: 'absolute',
      top: 12,
      left: 16,
      right: 16,
      alignItems: 'flex-start',
      zIndex: 10,
    },
    locationButton: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      elevation: 3,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    locationButtonText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    locationNotice: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      elevation: 3,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    locationNoticeText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    locationRetryText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 3,
    },
    driverLocationMarker: {
      alignItems: 'center',
      backgroundColor: 'rgba(37, 99, 235, 0.22)',
      borderColor: '#2563eb',
      borderRadius: 22,
      borderWidth: 2,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    driverLocationDot: {
      backgroundColor: '#2563eb',
      borderColor: '#ffffff',
      borderRadius: 9,
      borderWidth: 2,
      height: 18,
      width: 18,
    },

    // Android's custom-marker bitmap is capped at roughly a 100 px square on
    // some Google Maps/New Architecture combinations. Keep the complete badge
    // inside that stable frame so multi-digit labels are never cropped.
    pinSnapshotFrame: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Pin markers — simple rounded badges
    pin: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
      // Shadow for visibility
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 3,
        },
        android: {
          elevation: 4,
        },
      }),
    },
    pinPending: {
      backgroundColor: colors.primary,
    },
    pinComplete: {
      backgroundColor: '#10B981',
    },
    pinSelected: {
      borderColor: '#fbbf24',
      borderWidth: 3,
    },
    pinLabel: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'center',
      includeFontPadding: false,
    },
    pinLabelCompact: {
      fontSize: 9,
    },

    // Stop detail card
    stopCard: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      paddingBottom: 14 + bottomInset,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    stopCardHeader: {
      gap: 4,
    },
    stopCardLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    stopCardAddress: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    stopCardStatus: {
      fontSize: 13,
      color: colors.mutedText,
    },
    stopCardActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 8,
    },
    actionButton: {
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 16,
      minHeight: 44,
      justifyContent: 'center',
    },
    actionPrimary: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    actionPrimaryText: {
      color: onPrimary,
      fontWeight: '700',
    },
    actionSecondary: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    actionSecondaryText: {
      color: colors.primary,
      fontWeight: '700',
    },
    actionGhost: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionGhostText: {
      color: colors.mutedText,
      fontWeight: '700',
    },
    actionDanger: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerMuted,
    },
    actionDangerText: {
      color: colors.danger,
      fontWeight: '700',
    },
  });
}
