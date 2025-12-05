import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Marker, type LatLng, type MarkerPressEvent } from 'react-native-maps';

import { useTheme } from '@/features/theme/theme-context';

type MarkerBadgeProps = {
  id: string;
  coordinate: LatLng;
  label: string;
  backgroundColor: string;
  labelColor?: string;
  outlineColor?: string;
  shadowColor?: string;
  selected?: boolean;
  onPress?: (event: MarkerPressEvent) => void;
};

const TRACK_DISABLE_DELAY_MS = 48;

/**
 * Memoized marker wrapper that keeps the marker snapshot stable per RN Maps docs.
 */
function MarkerBadgeComponent({
  id,
  coordinate,
  label,
  backgroundColor,
  labelColor,
  outlineColor,
  shadowColor,
  selected = false,
  onPress,
}: MarkerBadgeProps) {
  const isAndroid = Platform.OS === 'android';
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const latestVisualState = useRef<string>('');
  const { colors, isDark } = useTheme();

  const resolvedLabelColor = labelColor ?? (isDark ? colors.text : colors.surface);
  const resolvedOutlineColor = outlineColor ?? (isDark ? colors.text : colors.surface);
  const resolvedShadowColor = shadowColor ?? colors.text;

  const visualState = useMemo(
    () =>
      `${label}-${backgroundColor}-${resolvedLabelColor}-${resolvedOutlineColor}-${resolvedShadowColor}-${selected ? 'sel' : 'idle'}`,
    [
      label,
      backgroundColor,
      resolvedLabelColor,
      resolvedOutlineColor,
      resolvedShadowColor,
      selected,
    ]
  );

  useEffect(() => {
    if (latestVisualState.current === visualState && !tracksViewChanges) {
      return;
    }
    latestVisualState.current = visualState;
    setTracksViewChanges(true);
    const timeout = setTimeout(() => setTracksViewChanges(false), TRACK_DISABLE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [visualState, tracksViewChanges]);

  return (
    <Marker
      identifier={id}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      calloutAnchor={{ x: 0.5, y: 0 }}
      tracksViewChanges={tracksViewChanges}
      onPress={onPress}
    >
      <View
        collapsable={false}
        renderToHardwareTextureAndroid={Platform.OS === 'android'}
        style={[styles.container, isAndroid ? styles.containerAndroid : null]}
      >
        {isAndroid ? (
          <View style={styles.androidLayer1}>
            <View style={styles.androidLayer2}>
              <View style={styles.androidLayer3}>
                <View style={styles.androidProbe}>
                  <Text style={styles.androidProbeText}>X</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.badge,
              isAndroid ? styles.badgeAndroid : null,
              { backgroundColor, borderColor: resolvedOutlineColor },
              selected ? (isAndroid ? styles.badgeSelectedAndroid : styles.badgeSelected) : null,
              selected ? { shadowColor: resolvedShadowColor } : null,
            ]}
          >
            <Text
              style={[
                styles.badgeLabel,
                isAndroid ? styles.badgeLabelAndroid : null,
                { color: resolvedLabelColor },
              ]}
            >
              {label}
            </Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

export const MarkerBadge = memo(MarkerBadgeComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  // Android-only root container so react-native-maps snapshots a generously sized bitmap.
  containerAndroid: {
    width: 120,
    height: 80,
    backgroundColor: 'rgba(255, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  // Android debug layers to visualize clipping through the hierarchy.
  androidLayer1: {
    width: 100,
    height: 70,
    backgroundColor: 'rgba(0, 255, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidLayer2: {
    width: 90,
    height: 60,
    backgroundColor: 'rgba(255, 255, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidLayer3: {
    width: 80,
    height: 50,
    backgroundColor: 'rgba(0, 0, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  // Android-only: deliberately oversized with thick border to verify this component is used and
  // to give react-native-maps a generous snapshot box (prevents clipped edges).
  badgeAndroid: {
    width: 90,
    minWidth: 90,
    height: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 8,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  badgeSelected: {
    transform: [{ scale: 1.1 }],
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeSelectedAndroid: {
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  badgeLabel: {
    fontWeight: '700',
  },
  badgeLabelAndroid: {
    fontSize: 18,
  },
  androidProbe: {
    width: 54,
    height: 54,
    backgroundColor: 'black',
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidProbeText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '800',
  },
});
