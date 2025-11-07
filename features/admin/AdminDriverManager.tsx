import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { DriverSummary } from '@/features/auth/types';

type AdminDriverManagerProps = {
  onSelectDriver?: (driverId: string) => void;
  refreshSignal?: number;
};

export function AdminDriverManager({
  onSelectDriver,
  refreshSignal,
}: AdminDriverManagerProps) {
  const { token } = useAuth();
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    async function loadDrivers() {
      try {
        setLoadingDrivers(true);
        setDrivers(await authApi.fetchDrivers(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load drivers.');
      } finally {
        setLoadingDrivers(false);
      }
    }
    loadDrivers();
  }, [token, refreshSignal]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Driver assignments</Text>
      <Text style={styles.description}>
        Pick a driver to edit their address list. Saving replaces the driver’s list and geocodes every
        line again so the map stays accurate.
      </Text>
      <View style={styles.driverColumn}>
        <Text style={styles.columnHeading}>Drivers</Text>
        {loadingDrivers ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator />
          </View>
        ) : drivers.length === 0 ? (
          <Text style={styles.emptyText}>No drivers yet. Create one above.</Text>
        ) : (
          <ScrollView style={styles.driverList}>
            {drivers.map((driver) => (
              <Pressable
                key={driver.id}
                style={({ pressed }) => [styles.driverButton, pressed && styles.driverButtonPressed]}
                onPress={() => onSelectDriver?.(driver.id)}
              >
                <Text style={styles.driverName} numberOfLines={1}>
                  {driver.fullName || driver.emailOrPhone}
                </Text>
                <Text style={styles.driverSub} numberOfLines={1}>
                  {driver.emailOrPhone}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#fff',
    padding: 20,
    gap: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  description: {
    color: '#475569',
    lineHeight: 20,
  },
  content: {
    flexDirection: 'row',
    gap: 20,
  },
  driverColumn: {
    width: 220,
    gap: 12,
  },
  editorColumn: {
    flex: 1,
    gap: 12,
  },
  columnHeading: {
    fontWeight: '600',
    color: '#1e293b',
  },
  driverList: {
    maxHeight: 280,
  },
  driverButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  driverButtonSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  driverButtonPressed: {
    opacity: 0.9,
  },
  driverName: {
    fontWeight: '600',
    color: '#0f172a',
  },
  driverNameSelected: {
    color: '#1d4ed8',
  },
  driverSub: {
    color: '#475569',
    fontSize: 12,
  },
  driverSubSelected: {
    color: '#1e3a8a',
  },
  editorCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 16,
    gap: 12,
    backgroundColor: '#f8fafc',
  },
  selectedName: {
    fontWeight: '600',
    color: '#1e293b',
  },
  editorHint: {
    color: '#475569',
    fontSize: 12,
  },
  textArea: {
    minHeight: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#94a3b8',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryPressed: {
    opacity: 0.85,
  },
  secondaryLabel: {
    color: '#1e293b',
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#2563eb',
  },
  primaryPressed: {
    opacity: 0.9,
  },
  primaryLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loaderText: {
    color: '#475569',
  },
  emptyText: {
    color: '#64748b',
    fontStyle: 'italic',
  },
  error: {
    color: '#dc2626',
  },
  success: {
    color: '#16a34a',
  },
});
