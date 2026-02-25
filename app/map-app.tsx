import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';

import { getGoogleMapsApiKey } from '@/features/route-planner/getGoogleMapsApiKey';
import { useTheme } from '@/features/theme/theme-context';

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
const MAP_ID = 'isolated-map-app';
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 44.9778, lng: -93.265 };
const DEFAULT_ZOOM = 12;

const SAMPLE_PINS: { id: string; label: string; position: google.maps.LatLngLiteral }[] = [
  { id: 'p1', label: '100', position: { lat: 44.9804, lng: -93.2638 } },
  { id: 'p2', label: '244', position: { lat: 44.9738, lng: -93.2582 } },
  { id: 'p3', label: '811', position: { lat: 44.9712, lng: -93.2721 } },
  { id: 'p4', label: '56', position: { lat: 44.9848, lng: -93.2767 } },
];

export default function MapAppScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<google.maps.LatLngLiteral | null>(null);
  const [status, setStatus] = useState<string>('Ready');
  const [isLocating, setIsLocating] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  const mapCanvasStyle = useMemo<CSSProperties>(
    () => ({
      width: '100%',
      height: '100%',
    }),
    []
  );

  const selectedPin = useMemo(
    () => SAMPLE_PINS.find((pin) => pin.id === selectedId) ?? null,
    [selectedId]
  );

  const locateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('Geolocation unavailable in this browser.');
      return;
    }
    setIsLocating(true);
    setStatus('Locating...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(next);
        setStatus(`Location acquired (${Math.round(pos.coords.accuracy)}m).`);
        if (mapRef.current) {
          mapRef.current.panTo(next);
          const currentZoom = mapRef.current.getZoom() ?? DEFAULT_ZOOM;
          if (currentZoom < 15) {
            mapRef.current.setZoom(15);
          }
        }
        setIsLocating(false);
      },
      (err) => {
        const label = err.code === 1 ? 'Permission denied.' : err.code === 2 ? 'Position unavailable.' : 'Timeout.';
        setStatus(`Locate failed: ${label}`);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
    );
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={styles.screen}>
        <Text style={styles.bannerTitle}>Map API key missing</Text>
        <Text style={styles.bannerText}>Set `EXPO_PUBLIC_GOOGLE_API_KEY` to use `/map-app`.</Text>
      </View>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <View style={[styles.screen, isFullScreen ? styles.screenFull : null]}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Isolated Map Sandbox</Text>
          <Pressable
            style={styles.button}
            onPress={() => setIsFullScreen((prev) => !prev)}
          >
            <Text style={styles.buttonText}>{isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}</Text>
          </Pressable>
        </View>

        <View style={[styles.mapWrap, isFullScreen ? styles.mapWrapFull : null]}>
          <Map
            id={MAP_ID}
            style={mapCanvasStyle}
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
            gestureHandling="greedy"
            disableDefaultUI
            mapTypeControl={false}
            streetViewControl={false}
            rotateControl={false}
            fullscreenControl={false}
            clickableIcons={false}
            onClick={() => setSelectedId(null)}
          >
            <MapRefBridge mapId={MAP_ID} onMapReady={(map) => (mapRef.current = map)} />
            {SAMPLE_PINS.map((pin) => (
              <Marker key={pin.id} position={pin.position} onClick={() => setSelectedId(pin.id)} />
            ))}
            {userPos ? <Marker position={userPos} /> : null}
          </Map>
        </View>

        <View style={styles.bottomBar}>
          <Pressable style={[styles.button, isLocating && styles.buttonDisabled]} onPress={locateMe}>
            <Text style={styles.buttonText}>{isLocating ? 'Locating...' : 'Locate me'}</Text>
          </Pressable>
          <Text style={styles.status}>{status}</Text>
          {selectedPin ? <Text style={styles.status}>Selected sample pin: {selectedPin.label}</Text> : null}
        </View>
      </View>
    </APIProvider>
  );
}

function MapRefBridge({
  mapId,
  onMapReady,
}: {
  mapId: string;
  onMapReady: (map: google.maps.Map) => void;
}) {
  const map = useMap(mapId);
  useEffect(() => {
    if (map) {
      onMapReady(map);
    }
  }, [map, onMapReady]);
  return null;
}

function createStyles(colors: { [k: string]: string }, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 12,
      gap: 10,
    },
    screenFull: {
      padding: 8,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    mapWrap: {
      flex: 1,
      minHeight: 320,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    mapWrapFull: {
      minHeight: 0,
      flex: 1,
    },
    bottomBar: {
      gap: 6,
    },
    button: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: isDark ? colors.surface : colors.primaryMuted,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      color: colors.primary,
      fontWeight: '700',
    },
    status: {
      color: colors.mutedText,
      fontSize: 12,
    },
    bannerTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    bannerText: {
      color: colors.mutedText,
      marginTop: 6,
    },
  });
}
