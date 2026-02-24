import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';

import { useTheme } from '@/features/theme/theme-context';
import { getGoogleMapsApiKey } from '@/features/route-planner/getGoogleMapsApiKey';
import { useWebLocationController } from '@/features/route-planner/useWebLocationController';
import type { WebLocationState } from '@/features/route-planner/web-location.types';

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
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 44.9778, lng: -93.265 };
const DEFAULT_ZOOM = 12;
const MIN_USER_ZOOM_APPROXIMATE = 14;
const MIN_USER_ZOOM_PRECISE = 16;
const FIT_BOUNDS_SUPPRESS_MS = 5000;
const INLINE_MAP_ID = 'route-map-inline';
const FULLSCREEN_MAP_ID = 'route-map-fullscreen';
const FORCE_WEB_LOCATION_DEBUG =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_WEB_LOCATION_DEBUG === '1';

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
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
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  // If this app is embedded cross-origin in the future, the parent iframe must include:
  // allow="geolocation" and a compatible Permissions-Policy.
  const {
    startLocate,
    state: locationState,
    hasFix,
    isPrecise,
  } = useWebLocationController({ autoStart: false, pollIntervalMs: 60000 });
  const mapRef = useRef<google.maps.Map | null>(null);
  const hasCenteredOnUserRef = useRef(false);
  const suppressFitBoundsUntilRef = useRef(0);
  const mapCanvasStyle = useMemo<CSSProperties>(
    () => ({
      width: '100%',
      height: '100%',
    }),
    []
  );

  const mapPins = useMemo<MapPin[]>(() => {
    const normalized: MapPin[] = [];
    pins.forEach((pin, index) => {
      const lat = toNumber(pin.lat);
      const lng = toNumber(pin.lng);
      if (lat === null || lng === null) {
        return;
      }

      const label =
        typeof pin.label === 'string' && pin.label.trim().length > 0
          ? pin.label.trim()
          : extractHouseNumber(pin.address) ?? String(index + 1);

      normalized.push({
        id: pin.id ?? String(index),
        position: { lat, lng },
        address: pin.address,
        label,
        status: pin.status === 'complete' ? 'complete' : 'pending',
      });
    });
    return normalized;
  }, [pins]);

  useEffect(() => {
    const dropped = pins.filter((pin) => toNumber(pin.lat) === null || toNumber(pin.lng) === null);
    if (dropped.length > 0) {
      console.warn(
        'Dropped pins missing lat/lng',
        dropped.map((pin) => ({ id: pin.id, lat: pin.lat, lng: pin.lng, label: pin.label }))
      );
    }
  }, [pins]);

  const applyUserViewport = (
    map: google.maps.Map | null,
    coords: google.maps.LatLngLiteral,
    precise: boolean
  ) => {
    if (!map) {
      return;
    }
    map.panTo(coords);
    const minZoom = precise ? MIN_USER_ZOOM_PRECISE : MIN_USER_ZOOM_APPROXIMATE;
    const currentZoom = map.getZoom() ?? DEFAULT_ZOOM;
    if (currentZoom < minZoom) {
      map.setZoom(minZoom);
    }
    hasCenteredOnUserRef.current = true;
    suppressFitBoundsUntilRef.current = Date.now() + FIT_BOUNDS_SUPPRESS_MS;
  };

  const handleStartLocate = useCallback(() => {
    hasCenteredOnUserRef.current = false;
    startLocate();
  }, [startLocate]);

  useEffect(() => {
    if (!hasFix || !locationState.coords || !mapRef.current) {
      return;
    }
    if (hasCenteredOnUserRef.current) {
      return;
    }
    applyUserViewport(mapRef.current, locationState.coords, isPrecise);
  }, [hasFix, isPrecise, locationState.coords]);

  const selectedMarker = useMemo(
    () => mapPins.find((marker) => marker.id === selectedId) ?? null,
    [mapPins, selectedId]
  );

  const initialCenter = useMemo(() => {
    if (selectedMarker) {
      return selectedMarker.position;
    }
    if (mapPins.length > 0) {
      return mapPins[0].position;
    }
    return DEFAULT_CENTER;
  }, [mapPins, selectedMarker]);

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
  const badgeOutlineColor = isDark ? colors.text : colors.surface;

  useEffect(() => {
    if (selectedId && !mapPins.some((marker) => marker.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, mapPins]);

  useEffect(() => {
    if (typeof exitFullScreenSignal === 'number') {
      setIsFullScreen(false);
    }
  }, [exitFullScreenSignal]);

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleMarkerClick = (marker: MapPin) => {
    handleSelect(marker.id);
  };

  const handleAdjustPin = (id: string) => {
    if (isFullScreen) {
      setIsFullScreen(false);
    }
    onAdjustPin?.(id);
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

  const handleUndo = async (id: string) => {
    if (actioningId) {
      return;
    }

    const shouldUndo =
      typeof window !== 'undefined' ? window.confirm('Undo confirmation?') : true;
    if (!shouldUndo) {
      return;
    }

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
  };

  const renderMarkers = () =>
    mapPins.map((marker) => {
      const isSelected = marker.id === selectedId;
      const isConfirmed = marker.status === 'complete' || Boolean(confirmed[marker.id]);
      const fillColor = isSelected
        ? isConfirmed
          ? selectedConfirmedPinColor
          : selectedPinColor
        : isConfirmed
        ? confirmedColor
        : pinColor;

      return (
        <BadgeMarker
          key={marker.id}
          label={marker.label}
          position={marker.position}
          fill={fillColor}
          labelColor={badgeLabelColor}
          outlineColor={badgeOutlineColor}
          selected={isSelected}
          onPress={() => handleMarkerClick(marker)}
        />
      );
    });

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
            <Text style={styles.toastStatus}>
              {isConfirmed
                ? 'Snow cleared. Tap undo to revert.'
                : 'Tap "Snow cleared" once this stop is finished.'}
            </Text>
            <View style={styles.toastActions}>
              {canAdjustPin ? (
                <Pressable
                  style={[styles.toastButton, styles.toastButtonSecondary]}
                  onPress={() => handleAdjustPin(selectedMarker.id)}
                >
                  <Text style={styles.toastButtonSecondaryText}>Adjust pin</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.toastButton, styles.toastButtonGhost]}
                onPress={() => setSelectedId(null)}
              >
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

  // renderSelectedCard was added accidentally and duplicated the existing toast UI; removed to avoid double overlays.

  const renderOverlay = () => {
    if (mapPins.length === 0) {
      return (
        <View pointerEvents="none" style={styles.noticeOverlay}>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Pins appear after the locations finish loading.</Text>
          </View>
        </View>
      );
    }

    const shouldShowLocationNotice =
      locationState.statusMessage !== null &&
      (locationState.status === 'denied' ||
        locationState.status === 'timeout' ||
        locationState.status === 'unavailable' ||
        locationState.status === 'unsupported' ||
        locationState.status === 'insecure_context' ||
        locationState.status === 'error');

    if (shouldShowLocationNotice) {
      return (
        <View pointerEvents="none" style={styles.noticeOverlay}>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{locationState.statusMessage}</Text>
          </View>
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

  const mapTypeId = mapType === 'satellite' ? 'satellite' : 'roadmap';
  // Use default Google styling for standard maps so base layers/buildings remain visible.
  const mapStyle = useMemo<google.maps.MapTypeStyle[] | undefined>(() => undefined, []);
  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
      rotateControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      tilt: 45,
      styles: mapStyle,
    }),
    [mapStyle]
  );

  const showLocationDebug = __DEV__ || FORCE_WEB_LOCATION_DEBUG;
  const locationDebugLabel = showLocationDebug
    ? formatWebLocationDebug(locationState)
    : null;

  const renderLocationButton = (variant: 'primary' | 'modal') => {
    const wrapperStyle =
      variant === 'primary'
        ? styles.locationButtonWrapper
        : styles.locationButtonWrapperFullScreen;
    return (
      <View pointerEvents="box-none" style={wrapperStyle}>
        <Pressable
          style={[styles.locationButton, locationState.isLocating && styles.locationButtonDisabled]}
          onPress={handleStartLocate}
        >
          <Text style={styles.locationButtonText}>
            {locationState.isLocating ? 'Locating...' : 'Locate me'}
          </Text>
        </Pressable>
        {showLocationDebug ? (
          <Text style={styles.locationDebugText} numberOfLines={3}>
            {locationDebugLabel}
          </Text>
        ) : null}
      </View>
    );
  };

  const fitPinsToMap = useCallback(
    (map: google.maps.Map | null) => {
      if (!map || mapPins.length === 0) {
        return;
      }
      if (Date.now() < suppressFitBoundsUntilRef.current) {
        return;
      }
      if (hasCenteredOnUserRef.current && hasFix) {
        return;
      }
      const bounds = new google.maps.LatLngBounds();
      mapPins.forEach((pin) => bounds.extend(pin.position));
      map.fitBounds(bounds);
    },
    [hasFix, mapPins]
  );

  // Some global CSS (e.g., img { max-width: 100% }) can distort Google map sprites.
  // Keep native image sizing, but never override transforms (tiles need transforms for pan/zoom).
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const id = 'google-maps-image-reset';
    if (document.getElementById(id)) {
      return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
      .gm-style img { max-width: none !important; }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    fitPinsToMap(mapRef.current);
  }, [fitPinsToMap]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={styles.container}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Google Maps API key for web is not configured. Set EXPO_PUBLIC_GOOGLE_API_KEY (or
            GOOGLE_API_KEY) to render the interactive map.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Geocoding addresses...</Text>
        </View>
      </View>
    );
  }

  if (!loading && mapPins.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.noticeStandalone}>
          <Text style={styles.noticeText}>Pins appear after the locations finish loading.</Text>
        </View>
      </View>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
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
          <Map
            id={INLINE_MAP_ID}
            style={mapCanvasStyle}
            defaultCenter={initialCenter}
            defaultZoom={DEFAULT_ZOOM}
            mapTypeId={mapTypeId}
            {...mapOptions}
            onClick={() => setSelectedId(null)}
          >
            <MapInstanceBridge
              mapId={INLINE_MAP_ID}
              onMapReady={(map) => {
                mapRef.current = map;
                if (hasFix && locationState.coords) {
                  applyUserViewport(map, locationState.coords, isPrecise);
                } else {
                  fitPinsToMap(map);
                }
              }}
            />
            {hasFix && locationState.coords ? (
              <UserLocationMarker
                position={locationState.coords}
                approximate={locationState.isApproximate}
              />
            ) : null}
            {renderMarkers()}
          </Map>
          {renderOverlay()}
          {renderLocationButton('primary')}
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
            <Map
              id={FULLSCREEN_MAP_ID}
              style={mapCanvasStyle}
              defaultCenter={initialCenter}
              defaultZoom={DEFAULT_ZOOM}
              mapTypeId={mapTypeId}
              {...mapOptions}
              onClick={() => setSelectedId(null)}
            >
              <MapInstanceBridge
                mapId={FULLSCREEN_MAP_ID}
                onMapReady={(map) => {
                  mapRef.current = map;
                  if (hasFix && locationState.coords) {
                    applyUserViewport(map, locationState.coords, isPrecise);
                  } else {
                    fitPinsToMap(map);
                  }
                }}
              />
              {hasFix && locationState.coords ? (
                <UserLocationMarker
                  position={locationState.coords}
                  approximate={locationState.isApproximate}
                />
              ) : null}
              {renderMarkers()}
            </Map>
            {renderOverlay()}
            {renderLocationButton('modal')}
            {renderToast('modal')}
          </View>
          </View>
        </Modal>
      </View>
    </APIProvider>
  );
}

type BadgeMarkerProps = {
  label: string;
  position: google.maps.LatLngLiteral;
  fill: string;
  labelColor: string;
  outlineColor: string;
  selected: boolean;
  draggable?: boolean;
  onPress: (event?: google.maps.MapMouseEvent) => void;
  onDragEnd?: (event: google.maps.MapMouseEvent) => void;
};

type MarkerVisual = {
  icon: google.maps.Icon;
  zIndex: number;
};

function BadgeMarker({
  label,
  position,
  fill,
  labelColor,
  outlineColor,
  selected,
  draggable = false,
  onPress,
  onDragEnd,
}: BadgeMarkerProps) {
  const [visual, setVisual] = useState<MarkerVisual | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const configure = () => {
      const maps = (globalThis as any).google?.maps;
      if (!maps) {
        if (!cancelled) {
          timeoutId = window.setTimeout(configure, 100);
        }
        return;
      }

      const glyph = label.trim().slice(0, 4);
      const safeGlyph = glyph
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      // Smaller, proportionally scaled badge to avoid cropping while reducing footprint.
      const baseWidth = 72;
      const baseHeight = 36;
      const scaledWidth = selected ? 78 : 72;
      const scaledHeight = Math.round(scaledWidth * (baseHeight / baseWidth));

      const icon = {
        url:
          'data:image/svg+xml;charset=UTF-8,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${baseWidth}" height="${baseHeight}" viewBox="0 0 ${baseWidth} ${baseHeight}">
              <g fill="none" fill-rule="evenodd">
                <g transform="translate(4 4)">
                  <rect width="64" height="28" rx="9" fill="${fill}" stroke="${outlineColor}" stroke-width="1.8"/>
                  <text x="32" y="18" font-family="Arial, sans-serif" font-size="14" font-weight="700" text-anchor="middle" fill="${labelColor}">${safeGlyph}</text>
                </g>
              </g>
            </svg>`
          ),
        size: new maps.Size(baseWidth, baseHeight),
        scaledSize: new maps.Size(scaledWidth, scaledHeight),
        anchor: new maps.Point(scaledWidth / 2, Math.round(scaledHeight * (30 / baseHeight))),
      };

      if (cancelled) {
        return;
      }

      setVisual({
        icon,
        zIndex: selected ? 2 : 1,
      });
    };

    configure();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [fill, label, labelColor, outlineColor, selected]);

  if (!visual) {
    return null;
  }

  return (
    <Marker
      position={position}
      onClick={onPress}
      onDragEnd={onDragEnd}
      draggable={draggable}
      icon={visual.icon}
      zIndex={visual.zIndex}
    />
  );
}

function UserLocationMarker({
  position,
  approximate,
}: {
  position: google.maps.LatLngLiteral;
  approximate: boolean;
}) {
  const [icons, setIcons] = useState<{
    core: google.maps.Symbol;
    ring: google.maps.Symbol | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const configure = () => {
      const maps = (globalThis as any).google?.maps;
      if (!maps) {
        if (!cancelled) {
          timeoutId = window.setTimeout(configure, 100);
        }
        return;
      }

      if (cancelled) {
        return;
      }

      const core: google.maps.Symbol = approximate
        ? {
            path: maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#1A73E8',
            fillOpacity: 0.74,
            strokeColor: '#FFFFFF',
            strokeOpacity: 0.9,
            strokeWeight: 2.5,
          }
        : {
            path: maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#1A73E8',
            fillOpacity: 0.95,
            strokeColor: '#FFFFFF',
            strokeOpacity: 1,
            strokeWeight: 3,
          };
      const ring: google.maps.Symbol | null = approximate
        ? {
            path: maps.SymbolPath.CIRCLE,
            scale: 18,
            fillColor: '#1A73E8',
            fillOpacity: 0.14,
            strokeColor: '#1A73E8',
            strokeOpacity: 0.28,
            strokeWeight: 2,
          }
        : null;

      setIcons({ core, ring });
    };

    configure();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [approximate]);

  if (!icons) {
    return null;
  }

  return (
    <>
      {icons.ring ? <Marker position={position} icon={icons.ring} zIndex={3} /> : null}
      <Marker position={position} icon={icons.core} zIndex={4} />
    </>
  );
}

function MapInstanceBridge({
  mapId,
  onMapReady,
}: {
  mapId?: string;
  onMapReady: (map: google.maps.Map) => void;
}) {
  const map = useMap(mapId ?? null);
  const onMapReadyRef = useRef(onMapReady);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    if (!map) {
      return;
    }
    onMapReadyRef.current(map);
  }, [map]);

  return null;
}


function extractHouseNumber(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}

function formatWebLocationDebug(state: WebLocationState): string {
  const accuracyLabel = state.accuracyM === null ? 'n/a' : `${Math.round(state.accuracyM)}m`;
  const coordLabel =
    state.coords === null
      ? 'none'
      : `${state.coords.lat.toFixed(5)},${state.coords.lng.toFixed(5)}`;
  const errorLabel = state.lastErrorCode === null ? 'none' : String(state.lastErrorCode);
  const updatedLabel =
    state.lastUpdateAtMs === null ? 'never' : new Date(state.lastUpdateAtMs).toLocaleTimeString();
  const nextPollLabel =
    state.nextPollAtMs === null ? 'off' : `${Math.max(0, Math.ceil((state.nextPollAtMs - Date.now()) / 1000))}s`;
  return `state:${state.status} acc:${accuracyLabel} fix:${coordLabel} approx:${state.isApproximate ? 'yes' : 'no'} err:${errorLabel} upd:${updatedLabel} poll:${nextPollLabel}`;
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const onPrimary = isDark ? colors.background : colors.surface;
  const overlayBackground = hexToRgba(colors.surface, isDark ? 0.88 : 0.92);
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
      backgroundColor: colors.surface,
    },
    fullScreenButtonText: {
      color: colors.primary,
      fontWeight: '600',
    },
    mapWrapper: {
      position: 'relative',
      height: 280,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
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
    noticeOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    notice: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.primaryMuted,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    noticeStandalone: {
      marginTop: 16,
      marginHorizontal: 16,
      padding: 16,
      borderRadius: 8,
      backgroundColor: colors.primaryMuted,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    noticeText: {
      color: colors.primary,
      textAlign: 'center',
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
    banner: {
      padding: 16,
      borderRadius: 8,
      backgroundColor: colors.primaryMuted,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    bannerText: {
      color: colors.primary,
    },
    loadingState: {
      marginTop: 16,
      marginHorizontal: 16,
      padding: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    loadingText: {
      fontSize: 16,
      color: colors.text,
    },
    toastOverlay: {
      ...StyleSheet.absoluteFillObject,
      pointerEvents: 'box-none',
    },
    toastContainer: {
      position: 'absolute',
      left: 16,
      right: 16,
      top: 72,
      alignItems: 'flex-end',
    },
    toastContainerFullScreen: {
      position: 'absolute',
      left: 12,
      right: 12,
      top: 84,
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
      position: 'relative',
      overflow: 'hidden',
    },
    modalHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 4,
      paddingTop: 12,
      paddingHorizontal: 12,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 16,
      backgroundColor: hexToRgba(colors.surface, isDark ? 0.72 : 0.8),
    },
    modalHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalMapWrapper: {
      flex: 1,
      margin: 0,
      borderRadius: 0,
      borderWidth: 0,
      overflow: 'hidden',
      position: 'relative',
    },
    locationButtonWrapper: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      zIndex: 6,
      alignItems: 'flex-end',
    },
    locationButtonWrapperFullScreen: {
      position: 'absolute',
      right: 12,
      bottom: 16,
      zIndex: 6,
      alignItems: 'flex-end',
    },
    locationButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: hexToRgba(colors.surface, isDark ? 0.86 : 0.94),
    },
    locationButtonDisabled: {
      opacity: 0.7,
    },
    locationButtonText: {
      color: colors.primary,
      fontWeight: '700',
    },
    locationDebugText: {
      marginTop: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: hexToRgba(colors.surface, isDark ? 0.8 : 0.9),
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.mutedText,
      fontSize: 11,
      maxWidth: 220,
      textAlign: 'right',
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

