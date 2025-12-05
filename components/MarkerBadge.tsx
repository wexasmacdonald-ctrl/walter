import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LatLng, MarkerPressEvent } from 'react-native-maps';

type MarkerBadgeProps = {
  MarkerComponent: any;
  id: string;
  coordinate: LatLng;
  label: string;
  backgroundColor: string;
  labelColor: string;
  borderColor: string;
  onPress?: (event: MarkerPressEvent) => void;
};

function MarkerBadgeComponent({
  MarkerComponent,
  id,
  coordinate,
  label,
  backgroundColor,
  labelColor,
  borderColor,
  onPress,
}: MarkerBadgeProps) {
  if (!MarkerComponent) {
    return null;
  }

  return (
    <MarkerComponent
      identifier={id}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      calloutAnchor={{ x: 0.5, y: 0 }}
      tracksViewChanges={false}
      onPress={onPress}
    >
      <View style={styles.rootBox}>
        <View style={[styles.pill, { backgroundColor, borderColor }]}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.pillText, { color: labelColor }]}>
            {label}
          </Text>
        </View>
      </View>
    </MarkerComponent>
  );
}

export const MarkerBadge = memo(MarkerBadgeComponent);

const styles = StyleSheet.create({
  rootBox: {
    width: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    minWidth: 32,
    maxWidth: 44,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
