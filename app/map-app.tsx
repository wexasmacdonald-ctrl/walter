import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MapScreen } from '@/features/route-planner/MapScreen';
import type { Stop } from '@/features/route-planner/types';
import { useTheme } from '@/features/theme/theme-context';

const SAMPLE_STOPS: Stop[] = [
  {
    id: 'sample-1',
    address: '100 Washington Ave N, Minneapolis, MN',
    lat: 44.9804,
    lng: -93.2638,
    sortOrder: 1,
    status: 'pending',
    label: '100',
  },
  {
    id: 'sample-2',
    address: '244 Hennepin Ave, Minneapolis, MN',
    lat: 44.9738,
    lng: -93.2582,
    sortOrder: 2,
    status: 'pending',
    label: '244',
  },
  {
    id: 'sample-3',
    address: '811 Marquette Ave, Minneapolis, MN',
    lat: 44.9712,
    lng: -93.2721,
    sortOrder: 3,
    status: 'complete',
    label: '811',
  },
  {
    id: 'sample-4',
    address: '56 University Ave SE, Minneapolis, MN',
    lat: 44.9848,
    lng: -93.2767,
    sortOrder: 4,
    status: 'pending',
    label: '56',
  },
];

export default function MapAppScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [stops, setStops] = useState<Stop[]>(SAMPLE_STOPS);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Map App (Isolated)</Text>
      <Text style={styles.subtitle}>
        Uses the same `MapScreen` component with sample stops.
      </Text>
      <MapScreen
        pins={stops}
        onCompleteStop={(stopId) => {
          setStops((prev) =>
            prev.map((stop) => (stop.id === stopId ? { ...stop, status: 'complete' } : stop))
          );
        }}
        onUndoStop={(stopId) => {
          setStops((prev) =>
            prev.map((stop) => (stop.id === stopId ? { ...stop, status: 'pending' } : stop))
          );
        }}
      />
    </View>
  );
}

function createStyles(colors: { [k: string]: string }) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    subtitle: {
      marginTop: 4,
      marginBottom: 10,
      color: colors.mutedText,
      fontSize: 12,
    },
  });
}
