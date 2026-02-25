import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';

import { useTheme } from '@/features/theme/theme-context';
import { getGoogleMapsApiKey } from '@/features/route-planner/getGoogleMapsApiKey';
import { useWebLocationController } from '@/features/route-planner/useWebLocationController';

import type { Stop } from './types';

export type MapScreenProps = {
  pins: Stop[];
  loading?: boolean;
  onCompleteStop?: (stopId: string) => Promise<void> | void;
  onUndoStop?: (stopId: string) => Promise<void> | void;
  onAdjustPin?: (stopId: string) => void;
  onAdjustPinDrag?: (
    stopId: string,
    coordinate: { latitude: number; longitude: number }
  ) => Promise<void> | void;
  exitFullScreenSignal?: number;
};

type MapPin = {
  id: string;
  position: google.maps.LatLngLiteral;
  address: string | null | undefined;
  label: string;
  status: 'pending' | 'complete';
};

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
const MAP_ID = 'route-map-v2';
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 44.9778, lng: -93.265 };
const DEFAULT_ZOOM = 12;

const FORCE_WEB_LOCATION_DEBUG =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_WEB_LOCATION_DEBUG === '1';

export function MapScreen({
  pins,
  loading = false,
  onCompleteStop,
  onUndoStop,
  onAdjustPin,
  exitFullScreenSignal,
}: MapScreenProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<Record<string, number>>({});
  const rootElementId = 'web-map-v2-root';

  const {
    startLocate,
    state: locationState,
    hasFix,
  } = useWebLocationController({ autoStart: true, pollIntervalMs: 60000 });

  const mapRef = useRef<google.maps.Map | null>(null);
  const lastFitKeyRef = useRef<string | null>(null);

  const mapCanvasStyle = useMemo<CSSProperties>(() => ({ width: '100%', height: '100%' }), []);
  const fullScreenViewportStyle = useMemo<CSSProperties>(
    () => ({
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100dvh',
      zIndex: 2147483000,
      paddingTop: 'env(safe-area-inset-top)',
      paddingRight: 'env(safe-area-inset-right)',
      paddingBottom: 'env(safe-area-inset-bottom)',
      paddingLeft: 'env(safe-area-inset-left)',
    }),
    []
  );

  const mapPins = useMemo<MapPin[]>(() => {
    const next: MapPin[] = [];
    pins.forEach((pin, index) => {
      const lat = toNumber(pin.lat);
      const lng = toNumber(pin.lng);
      if (lat === null || lng === null) {
        return;
      }
      const label =
        typeof pin.label === 'string' && pin.label.trim().length > 0
          ? pin.label.trim().slice(0, 4)
          : extractHouseNumber(pin.address) ?? String(index + 1);
      next.push({
        id: pin.id ?? String(index),
        position: { lat, lng },
        address: pin.address,
        label,
        status: pin.status === 'complete' ? 'complete' : 'pending',
      });
    });
    return next;
  }, [pins]);

  const selectedPin = useMemo(
    () => mapPins.find((pin) => pin.id === selectedId) ?? null,
    [mapPins, selectedId]
  );

  const boundsKey = useMemo(
    () => mapPins.map((pin) => `${pin.id}:${pin.position.lat.toFixed(6)}:${pin.position.lng.toFixed(6)}`).join('|'),
    [mapPins]
  );

  useEffect(() => {
    if (selectedId && !mapPins.some((pin) => pin.id === selectedId)) {
      setSelectedId(null);
    }
  }, [mapPins, selectedId]);

  useEffect(() => {
    if (typeof exitFullScreenSignal === 'number') {
      setIsFullScreen(false);
    }
  }, [exitFullScreenSignal]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const onFullscreenChange = () => {
      const active = document.fullscreenElement !== null;
      setIsFullScreen(active);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || !isFullScreen) {
      return;
    }
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocOverflow;
    };
  }, [isFullScreen]);

  const fitPinsToMap = useCallback(
    (map: google.maps.Map | null) => {
      if (!map || mapPins.length === 0) {
        return;
      }
      if (lastFitKeyRef.current === boundsKey) {
        return;
      }

      const bounds = new google.maps.LatLngBounds();
      mapPins.forEach((pin) => bounds.extend(pin.position));
      map.fitBounds(bounds);
      lastFitKeyRef.current = boundsKey;
    },
    [boundsKey, mapPins]
  );

  useEffect(() => {
    if (mapRef.current) {
      fitPinsToMap(mapRef.current);
    }
  }, [fitPinsToMap]);

  const handleLocate = () => {
    startLocate();
  };

  const handleConfirm = async (id: string) => {
    if (confirmingId) {
      return;
    }
    setConfirmingId(id);
    setConfirmedAt((prev) => ({ ...prev, [id]: Date.now() }));
    try {
      await onCompleteStop?.(id);
    } catch (error) {
      console.warn('Failed to confirm stop', error);
      setConfirmedAt((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } finally {
      setConfirmingId(null);
      setSelectedId(null);
    }
  };

  const handleUndo = async (id: string) => {
    if (confirmingId) {
      return;
    }
    setConfirmingId(id);
    setConfirmedAt((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await onUndoStop?.(id);
    } catch (error) {
      console.warn('Failed to undo stop', error);
      setConfirmedAt((prev) => ({ ...prev, [id]: Date.now() }));
    } finally {
      setConfirmingId(null);
      setSelectedId(null);
    }
  };

  const showLocationNotice =
    locationState.statusMessage !== null &&
    (locationState.status === 'denied' ||
      locationState.status === 'timeout' ||
      locationState.status === 'unavailable' ||
      locationState.status === 'unsupported' ||
      locationState.status === 'insecure_context' ||
      locationState.status === 'error');

  const activeContainerStyle = isFullScreen
    ? [styles.container, styles.containerFullScreen, fullScreenViewportStyle as any]
    : [styles.container];
  const activeMapWrapStyle = isFullScreen ? [styles.mapWrap, styles.mapWrapFullScreen] : [styles.mapWrap];

  const handleToggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') {
      setIsFullScreen((prev) => !prev);
      return;
    }

    const rootEl = document.getElementById(rootElementId);
    const canRequest = !!rootEl && typeof (rootEl as any).requestFullscreen === 'function';
    const canExit = typeof document.exitFullscreen === 'function';

    if (!isFullScreen) {
      if (canRequest) {
        try {
          await (rootEl as any).requestFullscreen();
          return;
        } catch (error) {
          console.warn('Fullscreen API request failed, using CSS fallback.', error);
        }
      }
      setIsFullScreen(true);
      return;
    }

    if (document.fullscreenElement && canExit) {
      try {
        await document.exitFullscreen();
        return;
      } catch (error) {
        console.warn('Fullscreen API exit failed, using CSS fallback.', error);
      }
    }
    setIsFullScreen(false);
  }, [isFullScreen, rootElementId]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={styles.container}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Google Maps key missing. Set `EXPO_PUBLIC_GOOGLE_API_KEY` for web maps.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading map pins...</Text>
        </View>
      </View>
    );
  }

  if (!loading && mapPins.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>No pin coordinates available yet.</Text>
        </View>
      </View>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <View nativeID={rootElementId} style={activeContainerStyle}>
        <View style={styles.topRow}>
          <View style={styles.mapTypeToggle}>
            <Pressable
              style={[styles.mapTypeButton, mapType === 'roadmap' && styles.mapTypeButtonActive]}
              onPress={() => setMapType('roadmap')}
            >
              <Text style={[styles.mapTypeText, mapType === 'roadmap' && styles.mapTypeTextActive]}>Map</Text>
            </Pressable>
            <Pressable
              style={[styles.mapTypeButton, mapType === 'satellite' && styles.mapTypeButtonActive]}
              onPress={() => setMapType('satellite')}
            >
              <Text style={[styles.mapTypeText, mapType === 'satellite' && styles.mapTypeTextActive]}>Satellite</Text>
            </Pressable>
          </View>
          <Pressable style={styles.fullScreenButton} onPress={handleToggleFullscreen}>
            <Text style={styles.fullScreenButtonText}>{isFullScreen ? 'Close' : 'Full Screen'}</Text>
          </Pressable>
        </View>

        <View style={activeMapWrapStyle}>
          <Map
            id={MAP_ID}
            style={mapCanvasStyle}
            defaultCenter={mapPins[0]?.position ?? DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
            mapTypeId={mapType}
            disableDefaultUI
            gestureHandling="greedy"
            clickableIcons={false}
            streetViewControl={false}
            fullscreenControl={false}
            rotateControl={false}
            mapTypeControl={false}
            onClick={() => setSelectedId(null)}
          >
            <MapRefBridge
              mapId={MAP_ID}
              onMapReady={(map) => {
                mapRef.current = map;
                fitPinsToMap(map);
              }}
            />
            {mapPins.map((pin) => {
              const isSelected = pin.id === selectedId;
              const isConfirmed = pin.status === 'complete' || Boolean(confirmedAt[pin.id]);
              const pinFill = isConfirmed ? '#10B981' : isSelected ? '#2563EB' : '#1D4ED8';
              return (
                <Marker
                  key={pin.id}
                  position={pin.position}
                  onClick={() => setSelectedId(pin.id)}
                  icon={buildBadgePinIcon(pin.label, pinFill, isSelected)}
                  zIndex={isSelected ? 5 : 3}
                  opacity={1}
                />
              );
            })}
            {hasFix && locationState.coords ? (
              <Marker
                position={locationState.coords}
                icon={buildUserBlueDotIcon()}
                zIndex={9}
                title="Your location"
              />
            ) : null}
          </Map>
        </View>

        <View style={styles.bottomPanel}>
          <View style={styles.locationRow}>
            <Pressable
              style={[styles.locateButton, locationState.isLocating && styles.locateButtonDisabled]}
              onPress={handleLocate}
            >
              <Text style={styles.locateButtonText}>{locationState.isLocating ? 'Locating...' : 'Locate me'}</Text>
            </Pressable>
            {FORCE_WEB_LOCATION_DEBUG ? (
              <Text style={styles.debugText} numberOfLines={2}>
                {`state:${locationState.status} acc:${locationState.accuracyM === null ? 'n/a' : Math.round(locationState.accuracyM)}`}
              </Text>
            ) : null}
          </View>

          {showLocationNotice ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>{locationState.statusMessage}</Text>
            </View>
          ) : null}

          {selectedPin ? (
            <View style={styles.stopCard}>
              <Text style={styles.stopLabel}>{selectedPin.label}</Text>
              <Text style={styles.stopAddress} numberOfLines={2}>
                {selectedPin.address || 'Address unavailable'}
              </Text>
              <View style={styles.actionsRow}>
                {onAdjustPin ? (
                  <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={() => onAdjustPin(selectedPin.id)}>
                    <Text style={styles.secondaryBtnText}>Adjust pin</Text>
                  </Pressable>
                ) : null}
                <Pressable style={[styles.actionBtn, styles.ghostBtn]} onPress={() => setSelectedId(null)}>
                  <Text style={styles.ghostBtnText}>Close</Text>
                </Pressable>
                {selectedPin.status === 'complete' || Boolean(confirmedAt[selectedPin.id]) ? (
                  <Pressable
                    style={[styles.actionBtn, styles.warnBtn]}
                    onPress={() => handleUndo(selectedPin.id)}
                    disabled={confirmingId === selectedPin.id}
                  >
                    <Text style={styles.warnBtnText}>{confirmingId === selectedPin.id ? 'Updating...' : 'Undo'}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.actionBtn, styles.primaryBtn]}
                    onPress={() => handleConfirm(selectedPin.id)}
                    disabled={confirmingId === selectedPin.id}
                  >
                    <Text style={styles.primaryBtnText}>{confirmingId === selectedPin.id ? 'Updating...' : 'Snow cleared'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </APIProvider>
  );
}

function MapRefBridge({ mapId, onMapReady }: { mapId: string; onMapReady: (map: google.maps.Map) => void }) {
  const map = useMap(mapId);

  useEffect(() => {
    if (map) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  return null;
}

function extractHouseNumber(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildBadgePinIcon(label: string, fill: string, selected: boolean): string {
  const width = selected ? 82 : 74;
  const height = selected ? 40 : 36;
  const text = escapeSvgText((label || '').slice(0, 4));
  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${width}\" height=\"${height}\" viewBox=\"0 0 ${width} ${height}\"><rect x=\"2\" y=\"2\" width=\"${width - 4}\" height=\"${height - 4}\" rx=\"10\" fill=\"${fill}\" stroke=\"#ffffff\" stroke-width=\"2\"/><text x=\"${Math.round(width / 2)}\" y=\"${Math.round(height / 2) + 5}\" text-anchor=\"middle\" font-family=\"Arial, sans-serif\" font-size=\"14\" font-weight=\"700\" fill=\"#ffffff\">${text}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildUserBlueDotIcon(): string {
  const size = 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#1A73E8" stroke="#FFFFFF" stroke-width="4"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const onPrimary = isDark ? colors.background : colors.surface;
  return StyleSheet.create({
    container: {
      marginTop: 48,
      gap: 10,
    },
    containerFullScreen: {
      marginTop: 0,
      backgroundColor: colors.background,
      padding: 12,
      minHeight: 0,
    },
    topRow: {
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
      width: 170,
    },
    mapTypeButton: {
      flex: 1,
      paddingVertical: 7,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    mapTypeButtonActive: {
      backgroundColor: colors.primary,
    },
    mapTypeText: {
      color: colors.mutedText,
      fontWeight: '600',
    },
    mapTypeTextActive: {
      color: onPrimary,
    },
    fullScreenButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    fullScreenButtonText: {
      color: colors.primary,
      fontWeight: '700',
    },
    mapWrap: {
      height: 300,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    mapWrapFullScreen: {
      flex: 1,
      minHeight: 280,
      height: undefined,
    },
    bottomPanel: {
      gap: 8,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    locateButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    locateButtonDisabled: {
      opacity: 0.7,
    },
    locateButtonText: {
      color: colors.primary,
      fontWeight: '700',
    },
    debugText: {
      flex: 1,
      fontSize: 11,
      textAlign: 'right',
      color: colors.mutedText,
    },
    noticeCard: {
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
    },
    noticeText: {
      color: colors.primary,
      textAlign: 'center',
    },
    stopCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 8,
    },
    stopLabel: {
      color: colors.primary,
      fontWeight: '700',
      textTransform: 'uppercase',
      fontSize: 12,
    },
    stopAddress: {
      color: colors.text,
      fontWeight: '600',
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'flex-end',
    },
    actionBtn: {
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    primaryBtn: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    primaryBtnText: {
      color: onPrimary,
      fontWeight: '700',
    },
    warnBtn: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerMuted,
    },
    warnBtnText: {
      color: colors.danger,
      fontWeight: '700',
    },
    secondaryBtn: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    secondaryBtnText: {
      color: colors.primary,
      fontWeight: '700',
    },
    ghostBtn: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    ghostBtnText: {
      color: colors.mutedText,
      fontWeight: '700',
    },
    loadingCard: {
      marginTop: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      color: colors.text,
      fontSize: 15,
    },
    banner: {
      marginTop: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
      padding: 14,
    },
    bannerText: {
      color: colors.primary,
    },
  });
}
