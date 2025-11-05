import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MapScreen } from '@/features/route-planner/MapScreen';
import { PinsForm } from '@/features/route-planner/PinsForm';
import { Stop } from '@/features/route-planner/types';

export default function PinPlannerScreen() {
  const [pins, setPins] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Drop Pins From Addresses</Text>
      <PinsForm pins={pins} onPinsChange={setPins} onLoadingChange={setLoading} />
      <MapScreen pins={pins} loading={loading} />
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {pins.length === 0
            ? 'No pins yet. Paste a list of addresses to get started.'
            : `Showing ${pins.length} pin${pins.length === 1 ? '' : 's'}.`}
        </Text>
      </View>
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 96,
    gap: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  summary: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#eef2ff',
  },
  summaryText: {
    color: '#312e81',
  },
});
