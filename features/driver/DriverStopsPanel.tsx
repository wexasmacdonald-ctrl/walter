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
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

type DriverStopsPanelProps = {
  refreshSignal?: number;
};

const extractHouseNumber = (address: string | null | undefined): string | null => {
  if (!address) {
    return null;
  }
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
};

export function DriverStopsPanel({ refreshSignal }: DriverStopsPanelProps) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [stops, setStops] = useState<DriverStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    refreshStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refreshSignal]);

  useEffect(() => {
    if (stops.length === 0) {
      setListOpen(false);
    }
  }, [stops.length]);

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
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't load your stops. Pull to refresh and try again.",
        })
      );
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
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't update that stop. Try again in a moment.",
        })
      );
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
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't undo that change. Try again.",
        })
      );
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
        label: extractHouseNumber(stop.address) ?? undefined,
      })),
    [stops]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Your run</Text>
        <Pressable style={styles.refreshButton} onPress={refreshStops} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.refreshText}>Refresh</Text>
          )}
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
        <Pressable
          style={({ pressed }) => [styles.listToggle, pressed && styles.listTogglePressed]}
          onPress={() => setListOpen((prev) => !prev)}
          accessibilityRole="button"
        >
          <Text style={styles.listHeading}>
            {listOpen ? 'Hide stops' : `Show stops${stops.length ? ` (${stops.length})` : ''}`}
          </Text>
        </Pressable>
        {listOpen ? (
          stops.length === 0 ? (
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
          )
        ) : null}
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

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
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
      color: colors.text,
    },
    refreshButton: {
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 9999,
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: colors.primaryMuted,
    },
    refreshText: {
      color: colors.primary,
      fontWeight: '600',
    },
    error: {
      color: colors.danger,
    },
    listCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12,
    },
    listToggle: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primaryMuted,
      alignItems: 'center',
    },
    listTogglePressed: {
      opacity: 0.9,
    },
    listHeading: {
      fontWeight: '600',
      color: colors.primary,
    },
    emptyText: {
      color: colors.mutedText,
    },
    list: {
      maxHeight: 220,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      color: colors.primary,
    },
    listRowAddress: {
      flex: 1,
      color: colors.text,
    },
    listRowStatus: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    listRowStatusDone: {
      color: colors.success,
    },
  });
}
