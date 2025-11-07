import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';

import type { Stop } from './types';

export type MapScreenProps = {
  pins: Stop[];
  loading?: boolean;
  onCompleteStop?: (stopId: string) => Promise<void> | void;
  onUndoStop?: (stopId: string) => Promise<void> | void;
};

type MapPin = {
  id: string;
  position: google.maps.LatLngLiteral;
  address: string | null | undefined;
  label: string;
};

const PIN_COLOR = '#2563eb';
const SELECTED_PIN_COLOR = '#60a5fa';
const CONFIRMED_PIN_COLOR = '#22c55e';
const SELECTED_CONFIRMED_PIN_COLOR = '#86efac';
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 44.9778, lng: -93.265 };
const DEFAULT_ZOOM = 12;

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';

export function MapScreen({
  pins,
  loading = false,
  onCompleteStop,
  onUndoStop,
}: MapScreenProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');

  const mapPins = useMemo<MapPin[]>(() => {
    return pins
      .filter(
        (pin): pin is Stop & { lat: number; lng: number } =>
          typeof pin.lat === 'number' && typeof pin.lng === 'number'
      )
      .map((pin, index) => {
        const label =
          typeof pin.label === 'string' && pin.label.trim().length > 0
            ? pin.label.trim()
            : extractHouseNumber(pin.address) ?? String(index + 1);

        return {
          id: pin.id ?? String(index),
          position: { lat: pin.lat, lng: pin.lng },
          address: pin.address,
          label,
          status: pin.status === 'complete' ? 'complete' : 'pending',
        };
      });
  }, [pins]);

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

  useEffect(() => {
    if (selectedId && !mapPins.some((marker) => marker.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, mapPins]);


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
          ? SELECTED_CONFIRMED_PIN_COLOR
          : SELECTED_PIN_COLOR
        : isConfirmed
        ? CONFIRMED_PIN_COLOR
        : PIN_COLOR;

      return (
        <BadgeMarker
          key={marker.id}
          label={marker.label}
          position={marker.position}
          fill={fillColor}
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
                    {actioningId === selectedMarker.id ? 'Updating…' : 'Undo'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.toastButton, styles.toastButtonPrimary]}
                  onPress={() => handleConfirm(selectedMarker.id)}
                  disabled={actioningId === selectedMarker.id}
                >
                  <Text style={styles.toastButtonPrimaryText}>
                    {actioningId === selectedMarker.id ? 'Updating…' : 'Snow cleared'}
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
          <ActivityIndicator />
          <Text style={styles.mapOverlayText}>Loading pins…</Text>
        </View>
      );
    }

    if (mapPins.length === 0) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Pins appear once addresses are geocoded.</Text>
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

  const mapTypeId = mapType === 'satellite' ? 'satellite' : 'roadmap';

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingState}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Geocoding addresses…</Text>
        </View>
      </View>
    );
  }

  if (!loading && mapPins.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.noticeStandalone}>
          <Text style={styles.noticeText}>Pins appear once addresses are geocoded.</Text>
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
            style={styles.mapCanvas}
            defaultCenter={initialCenter}
            defaultZoom={DEFAULT_ZOOM}
            mapTypeId={mapTypeId}
            options={{
              disableDefaultUI: true,
              clickableIcons: false,
              gestureHandling: 'greedy',
            }}
            onClick={() => setSelectedId(null)}
          >
            <BoundsController markers={mapPins} />
            {renderMarkers()}
          </Map>
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
              <Map
                style={styles.mapCanvas}
                defaultCenter={initialCenter}
                defaultZoom={DEFAULT_ZOOM}
                mapTypeId={mapTypeId}
                options={{
                  disableDefaultUI: true,
                  clickableIcons: false,
                  gestureHandling: 'greedy',
                }}
                onClick={() => setSelectedId(null)}
              >
                <BoundsController markers={mapPins} />
                {renderMarkers()}
              </Map>
              {renderOverlay()}
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
  selected: boolean;
  onPress: () => void;
};

function BadgeMarker({ label, position, fill, selected, onPress }: BadgeMarkerProps) {
  const [options, setOptions] = useState<google.maps.MarkerOptions | null>(null);

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
      const safeGlyph = glyph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const scaledSize = selected ? 96 : 90;

      const icon = {
        url:
          'data:image/svg+xml;charset=UTF-8,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="46" viewBox="0 0 90 46">
              <g fill="none" fill-rule="evenodd">
                <g transform="translate(5 5)">
                  <rect width="80" height="36" rx="10" fill="${fill}" stroke="#FFF" stroke-width="2"/>
                  <text x="40" y="23" font-family="Arial, sans-serif" font-size="16" font-weight="700" text-anchor="middle" fill="#FFF">${safeGlyph}</text>
                </g>
              </g>
            </svg>`
          ),
        scaledSize: new maps.Size(scaledSize, Math.round(scaledSize * (46 / 90))),
        anchor: new maps.Point(scaledSize / 2, Math.round(scaledSize * (40 / 90))),
      };

      if (cancelled) {
        return;
      }

      setOptions({
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
  }, [fill, label, selected]);

  if (!options) {
    return null;
  }

  return <Marker position={position} onClick={onPress} {...options} />;
}

function BoundsController({ markers }: { markers: MapPin[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || markers.length === 0) {
      return;
    }

    const maps = (globalThis as any).google?.maps;
    if (!maps) {
      return;
    }

    if (markers.length === 1) {
      map.setZoom(15);
      map.panTo(markers[0].position);
      return;
    }

    const bounds = new maps.LatLngBounds();
    markers.forEach((marker) => bounds.extend(marker.position));
    map.fitBounds(bounds, { top: 80, right: 40, bottom: 80, left: 40 });
  }, [map, markers]);

  return null;
}

function extractHouseNumber(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}

const styles = StyleSheet.create({
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
  mapCanvas: {
    width: '100%',
    height: '100%',
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
  noticeStandalone: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#cbd5f5',
  },
  loadingState: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d4d4d8',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#1f2937',
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
    borderColor: '#d4d4d8',
    overflow: 'hidden',
    position: 'relative',
  },
  mapTypeToggle: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d4d4d8',
    overflow: 'hidden',
    width: 160,
  },
  mapTypeOption: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTypeOptionActive: {
    backgroundColor: '#2563eb',
  },
  mapTypeOptionText: {
    fontWeight: '600',
    color: '#4b5563',
  },
  mapTypeOptionTextActive: {
    color: '#ffffff',
  },
  banner: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  bannerText: {
    color: '#312e81',
  },
});
