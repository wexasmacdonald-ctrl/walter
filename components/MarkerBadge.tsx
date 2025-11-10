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
        style={[
          styles.badge,
          { backgroundColor, borderColor: resolvedOutlineColor },
          selected ? styles.badgeSelected : null,
          selected ? { shadowColor: resolvedShadowColor } : null,
        ]}
      >
        <Text style={[styles.badgeLabel, { color: resolvedLabelColor }]}>{label}</Text>
      </View>
    </Marker>
  );
}

export const MarkerBadge = memo(MarkerBadgeComponent);

const styles = StyleSheet.create({
  badge: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSelected: {
    transform: [{ scale: 1.1 }],
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeLabel: {
    fontWeight: '700',
  },
});
