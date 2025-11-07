import { useEffect, useMemo, useState } from 'react';
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
import type { DriverStop } from '@/features/auth/types';
import type { Stop } from '@/features/route-planner/types';
import { MapScreen } from '@/features/route-planner/MapScreen';

type DriverStopsPanelProps = {
  refreshSignal?: number;
};

export function DriverStopsPanel({ refreshSignal }: DriverStopsPanelProps) {
  const { token } = useAuth();
  const [stops, setStops] = useState<DriverStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refreshSignal]);

  const refreshStops = async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.fetchMyStops(token);
      setStops(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stops.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async (stopId: string) => {
    if (!token) {
      return;
    }
    try {
      const updated = await authApi.updateDriverStopStatus(token, stopId, 'complete');
      setStops((prev) => replaceStop(prev, updated));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark stop complete.');
    }
  };

  const handleUndo = async (stopId: string) => {
    if (!token) {
      return;
    }
    try {
      const updated = await authApi.updateDriverStopStatus(token, stopId, 'undo');
      setStops((prev) => replaceStop(prev, updated));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo stop completion.');
    }
  };

  const pins: Stop[] = useMemo(
    () =>
      stops.map((stop) => ({
        id: stop.id,
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
        status: stop.status,
        sortOrder: stop.sortOrder,
        label:
          typeof stop.sortOrder === 'number'
            ? String((stop.sortOrder ?? 0) + 1)
            : undefined,
      })),
    [stops]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Your run</Text>
        <Pressable style={styles.refreshButton} onPress={refreshStops} disabled={loading}>
          {loading ? <ActivityIndicator color="#1d4ed8" /> : <Text style={styles.refreshText}>Refresh</Text>}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <MapScreen
        pins={pins}
        loading={loading}
        onCompleteStop={handleMarkComplete}
        onUndoStop={handleUndo}
      />
      <View style={styles.listCard}>
        <Text style={styles.listHeading}>Stops</Text>
        {stops.length === 0 ? (
          <Text style={styles.emptyText}>No addresses assigned yet.</Text>
        ) : (
          <ScrollView style={styles.list}>
            {stops.map((stop, index) => {
              const statusLabel = stop.status === 'complete' ? 'Cleared' : 'Pending';
              return (
                <View key={stop.id} style={styles.listRow}>
                  <View style={styles.listRowMain}>
                    <Text style={styles.listRowIndex}>{index + 1}</Text>
                    <Text style={styles.listRowAddress}>{stop.address}</Text>
                  </View>
                  <Text style={[styles.listRowStatus, stop.status === 'complete' && styles.listRowStatusDone]}>
                    {statusLabel}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function replaceStop(stops: DriverStop[], updated: DriverStop): DriverStop[] {
  const index = stops.findIndex((stop) => stop.id === updated.id);
  if (index === -1) {
    return [...stops, updated];
  }
  const next = [...stops];
  next[index] = updated;
  return next;
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#e0ecff',
  },
  refreshText: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  error: {
    color: '#dc2626',
  },
  listCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
  },
  listHeading: {
    fontWeight: '600',
    color: '#1e293b',
  },
  emptyText: {
    color: '#64748b',
  },
  list: {
    maxHeight: 220,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
  },
  listRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  listRowIndex: {
    width: 24,
    textAlign: 'center',
    fontWeight: '600',
    color: '#1d4ed8',
  },
  listRowAddress: {
    flex: 1,
    color: '#0f172a',
  },
  listRowStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4338ca',
  },
  listRowStatusDone: {
    color: '#16a34a',
  },
});
