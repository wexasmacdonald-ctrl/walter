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
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { Stop } from './types';

const GOOGLE_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0b1220' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1220' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#172033' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#132235' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#374151' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#273449' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#475569' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#e5e7eb' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b2545' }] },
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
  const styles = useMemo(() => createStyles(colors, isDark, insets.top), [colors, isDark, insets.top]);
  const isAndroid = Platform.OS === 'android';

  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [actioningId, setActioningId] = useState<string | null>(null);

  const mapRef = useRef<MapView | null>(null);
  const didFitRef = useRef(false);

  const mapProvider = PROVIDER_GOOGLE;
  const resolvedMapType = useMemo(() => {
    if (mapType === 'satellite') return 'satellite';
    if (isAndroid) return 'standard';
    return isDark ? 'mutedStandard' : 'standard';
  }, [isDark, mapType, isAndroid]);

  const mapCustomStyle = useMemo(() => {
    if (!mapProvider || mapType !== 'standard' || !isDark) return undefined;
    return GOOGLE_DARK_MAP_STYLE;
  }, [isDark, mapProvider, mapType]);

  const markers = useMemo<RouteMarker[]>(() => {
    return pins
      .filter((pin): pin is Stop & { lat: number; lng: number } =>
        typeof pin.lat === 'number' && typeof pin.lng === 'number'
      )
      .map((pin, index) => {
        const label =
          typeof pin.label === 'string' && pin.label.trim().length > 0
            ? pin.label.trim().slice(0, 4)
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

  const fitToMarkers = useCallback((map: MapView | null) => {
    if (!map || coordinates.length === 0 || didFitRef.current) return;
    map.fitToCoordinates(coordinates, {
      edgePadding: { top: 80, right: 40, bottom: 120, left: 40 },
      animated: true,
    });
    didFitRef.current = true;
  }, [coordinates]);

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleConfirm = async (id: string) => {
    if (actioningId) return;
    setActioningId(id);
    setConfirmed((prev) => ({ ...prev, [id]: Date.now() }));
    try {
      await onCompleteStop?.(id);
    } catch {
      setConfirmed((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } finally {
      setActioningId(null);
    }
    setSelectedId(null);
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
          onPress={() => setIsOpen(true)}
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
    <Modal visible animationType="slide" onRequestClose={() => setIsOpen(false)}>
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
            <Pressable
              style={styles.closeButton}
              onPress={() => setIsOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close map"
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
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
              showsUserLocation
              showsCompass
              showsMyLocationButton
              showsBuildings
              customMapStyle={mapCustomStyle}
              userInterfaceStyle={isDark ? 'dark' : 'light'}
              onMapReady={() => fitToMarkers(mapRef.current)}
              onPress={(event: MapPressEvent) => {
                if (event.nativeEvent.action !== 'marker-press') {
                  setSelectedId(null);
                }
              }}
            >
              {markers.map((marker) => {
                const status = getMarkerStatus(marker);
                const isComplete = status === 'complete';
                const isSelected = marker.id === selectedId;
                return (
                  <Marker
                    key={`${marker.id}:${status}`}
                    coordinate={marker.coordinate}
                    onPress={() => handleSelect(marker.id)}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                  >
                    <View
                      style={[
                        styles.pin,
                        isComplete ? styles.pinComplete : styles.pinPending,
                        isSelected && styles.pinSelected,
                      ]}
                    >
                      <Text style={styles.pinLabel} numberOfLines={1}>
                        {marker.label}
                      </Text>
                    </View>
                  </Marker>
                );
              })}
            </MapView>
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
                  onPress={() => { setIsOpen(false); onAdjustPin?.(selectedMarker.id); }}
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
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean,
  topInset: number = 48
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

    // Pin markers — simple rounded badges
    pin: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#ffffff',
      minWidth: 32,
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
      fontSize: 12,
      fontWeight: '800',
      textAlign: 'center',
    },

    // Stop detail card
    stopCard: {
      paddingHorizontal: 16,
      paddingVertical: 14,
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
