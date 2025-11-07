import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { DriverStop, DriverSummary } from '@/features/auth/types';

const MAX_ADDRESSES = 150;

type AdminDriverDetailProps = {
  driverId: string;
  onClose: () => void;
  refreshSignal?: number;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
};

export function AdminDriverDetail({
  driverId,
  onClose,
  refreshSignal,
  refreshing = false,
  onRefresh,
}: AdminDriverDetailProps) {
  const { token } = useAuth();
  const [driver, setDriver] = useState<DriverSummary | null>(null);
  const [stops, setStops] = useState<DriverStop[]>([]);
  const [addressesText, setAddressesText] = useState('');
  const [loadingDriver, setLoadingDriver] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    async function loadDriver() {
      try {
        setLoadingDriver(true);
        const drivers = await authApi.fetchDrivers(token);
        setDriver(drivers.find((entry) => entry.id === driverId) ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load driver.');
      } finally {
        setLoadingDriver(false);
      }
    }
    loadDriver();
  }, [token, driverId, refreshSignal]);

  useEffect(() => {
    if (!token) {
      return;
    }
    async function loadStops() {
      try {
        setLoadingStops(true);
        const result = await authApi.fetchDriverStops(token, driverId);
        setStops(result);
        setAddressesText(result.map((stop) => stop.address).join('\n'));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stops.');
      } finally {
        setLoadingStops(false);
      }
    }
    loadStops();
  }, [token, driverId, refreshSignal]);

  const handleSave = async () => {
    if (!token) {
      return;
    }
    const trimmed = addressesText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (trimmed.length > MAX_ADDRESSES) {
      setError(`Mapbox limit is ${MAX_ADDRESSES} per request.`);
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await authApi.saveDriverStops(token, driverId, trimmed);
      setStops(updated);
      setAddressesText(updated.map((stop) => stop.address).join('\n'));
      setSuccess('Driver stops updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stops.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setAddressesText(stops.map((stop) => stop.address).join('\n'));
    setError(null);
    setSuccess(null);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Driver assignment</Text>
          {driver ? (
            <Text style={styles.subTitle} numberOfLines={1}>
              {driver.fullName || driver.emailOrPhone}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          onPress={onClose}
        >
          <Text style={styles.closeButtonText}>Back</Text>
        </Pressable>
      </View>

      {loadingDriver ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator />
          <Text style={styles.loaderText}>Loading driver…</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Address list</Text>
          <Text style={styles.cardHint}>
            Paste newline-separated addresses. Saving replaces the entire list and re-geocodes every
            address so the driver sees updated coordinates.
          </Text>
          <TextInput
            style={styles.textArea}
            multiline
            value={addressesText}
            onChangeText={setAddressesText}
            placeholder={'123 Main St, City, ST\n456 Pine Ave, Town, ST'}
            autoCorrect={false}
            autoCapitalize="none"
            editable={!saving}
          />
          {loadingStops ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator />
              <Text style={styles.loaderText}>Syncing stops…</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={handleReset}
              disabled={saving}
            >
              <Text style={styles.secondaryButtonText}>Revert changes</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save list</Text>}
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Current stops</Text>
          {stops.length === 0 ? (
            <Text style={styles.emptyText}>No addresses assigned yet.</Text>
          ) : (
            <View style={styles.stopsList}>
              {stops.map((stop, index) => (
                <View key={stop.id} style={styles.stopRow}>
                  <Text style={styles.stopIndex}>{index + 1}</Text>
                  <View style={styles.stopInfo}>
                    <Text style={styles.stopAddress}>{stop.address}</Text>
                    <Text style={styles.stopStatus}>
                      Status: {stop.status === 'complete' ? 'Complete' : 'Pending'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 96,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerInfo: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  subTitle: {
    marginTop: 4,
    color: '#475569',
  },
  closeButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  closeButtonPressed: {
    opacity: 0.85,
  },
  closeButtonText: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  content: {
    gap: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    gap: 16,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  cardHint: {
    color: '#475569',
    fontSize: 12,
  },
  textArea: {
    minHeight: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f9fafb',
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
    backgroundColor: '#fff',
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryButtonText: {
    color: '#1e293b',
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#2563eb',
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  loaderText: {
    color: '#475569',
  },
  stopsList: {
    gap: 12,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 12,
  },
  stopIndex: {
    width: 24,
    textAlign: 'center',
    fontWeight: '700',
    color: '#2563eb',
  },
  stopInfo: {
    flex: 1,
    gap: 4,
  },
  stopAddress: {
    color: '#0f172a',
  },
  stopStatus: {
    fontSize: 12,
    color: '#475569',
  },
  emptyText: {
    color: '#64748b',
  },
  error: {
    color: '#dc2626',
  },
  success: {
    color: '#16a34a',
  },
});
