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
import type { DriverSummary } from '@/features/auth/types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

type AdminDriverManagerProps = {
  onSelectDriver?: (driverId: string) => void;
  refreshSignal?: number;
};

export function AdminDriverManager({
  onSelectDriver,
  refreshSignal,
}: AdminDriverManagerProps) {
  const { token } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
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
        setError(
          getFriendlyError(err, {
            fallback: "We couldn't load drivers right now. Try again in a moment.",
          })
        );
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
        Pick a driver to edit their address list. Saving refreshes every location so the map stays accurate.
      </Text>
      <View style={styles.driverColumn}>
        <Text style={styles.columnHeading}>Drivers</Text>
        {loadingDrivers ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator color={colors.primary} />
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

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    container: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 16,
    },
    heading: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    description: {
      color: colors.mutedText,
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
      color: colors.text,
    },
    driverList: {
      maxHeight: 280,
    },
    driverButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
      backgroundColor: colors.surface,
    },
    driverButtonPressed: {
      opacity: 0.85,
    },
    driverName: {
      fontWeight: '600',
      color: colors.text,
    },
    driverSub: {
      color: colors.mutedText,
      fontSize: 12,
    },
    editorCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 16,
      gap: 12,
      backgroundColor: colors.surface,
    },
    selectedName: {
      fontWeight: '600',
      color: colors.text,
    },
    editorHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    textArea: {
      minHeight: 160,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
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
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
    },
    secondaryPressed: {
      opacity: 0.85,
    },
    secondaryLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    primaryButton: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primary,
    },
    primaryPressed: {
      opacity: 0.9,
    },
    primaryLabel: {
      color: isDark ? colors.background : colors.surface,
      fontWeight: '600',
    },
    loaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    loaderText: {
      color: colors.mutedText,
    },
    emptyText: {
      color: colors.mutedText,
      fontStyle: 'italic',
    },
    error: {
      color: colors.danger,
    },
    success: {
      color: colors.success,
    },
  });
}
