import { StyleSheet, Text, View } from 'react-native';

import { Stop } from './types';

export type MapScreenProps = {
  pins: Stop[];
  loading?: boolean;
};

export function MapScreen({ pins, loading }: MapScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Map Preview</Text>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          The interactive map is available in the native app. On web, use the pins list below to
          confirm geocoding results.
        </Text>
        {pins.length === 0 && (
          <Text style={styles.hint}>
            Submit a list of addresses to see the coordinates that will be rendered on the device.
          </Text>
        )}
        {loading && (
          <Text style={styles.hint}>Loading pins&hellip; this usually takes a few seconds.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 48,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  banner: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    gap: 8,
  },
  bannerText: {
    color: '#312e81',
  },
  hint: {
    color: '#4338ca',
    fontSize: 14,
  },
});
