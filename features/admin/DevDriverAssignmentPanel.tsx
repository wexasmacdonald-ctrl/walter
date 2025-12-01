import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { DriverSummary, WorkspaceSummary } from '@/features/auth/types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

type DevDriverAssignmentPanelProps = {
  refreshSignal?: number;
  onAssigned?: () => void;
};

export function DevDriverAssignmentPanel({
  refreshSignal,
  onAssigned,
}: DevDriverAssignmentPanelProps) {
  const { token, adminUpdateUserProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);

  const loadDrivers = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoadingDrivers(true);
    setError(null);
    try {
      const list = await authApi.fetchDevFreeDrivers(token);
      setDrivers(list);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't load free-tier users. Try again shortly.",
        })
      );
    } finally {
      setLoadingDrivers(false);
    }
  }, [token]);

  const loadWorkspaces = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoadingWorkspaces(true);
    try {
      const list = await authApi.fetchDevWorkspaces(token);
      setWorkspaces(list);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't load companies yet. Refresh in a moment.",
        })
      );
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [token]);

  useEffect(() => {
    void loadDrivers();
    void loadWorkspaces();
  }, [loadDrivers, loadWorkspaces, refreshSignal]);

  const handleAssignDriver = async (driver: DriverSummary, workspace: WorkspaceSummary) => {
    setAssigningKey(`${driver.id}:${workspace.id}`);
    setError(null);
    setMessage(null);
    try {
      await adminUpdateUserProfile(driver.id, { workspaceId: workspace.id });
      setMessage(`${driver.fullName ?? driver.emailOrPhone} joined ${workspace.name}.`);
      setExpandedDriverId(null);
      await loadDrivers();
      onAssigned?.();
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't assign that user. Try again.",
        })
      );
    } finally {
      setAssigningKey(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title}>Assign company</Text>
          <Text style={styles.subtitle}>
            Every driver starts on the free tier. Tap a name, pick a company, and the assignment happens
            automatically.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
          onPress={() => {
            void loadDrivers();
            void loadWorkspaces();
          }}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {workspaces.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Create your first company before assigning drivers.
          </Text>
        </View>
      ) : null}

      <View style={styles.driverList}>
        {loadingDrivers ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loaderText}>Loading drivers…</Text>
          </View>
        ) : drivers.length === 0 ? (
          <Text style={styles.emptyText}>Every driver already belongs to a company.</Text>
        ) : (
          drivers.map((driver) => {
            const expanded = expandedDriverId === driver.id;
            return (
              <View key={driver.id} style={styles.driverRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.driverButton,
                    pressed && styles.driverButtonPressed,
                    expanded && styles.driverButtonActive,
                  ]}
                  onPress={() =>
                    setExpandedDriverId((prev) => (prev === driver.id ? null : driver.id))
                  }
                >
                  <Text style={styles.driverName}>{driver.fullName ?? 'Unnamed driver'}</Text>
                  <Text style={styles.driverContact}>{driver.emailOrPhone}</Text>
                  <Text style={styles.driverHint}>
                    {expanded ? 'Choose a company below' : 'Tap to assign company'}
                  </Text>
                </Pressable>
                {expanded ? (
                  <View style={styles.workspaceButtons}>
                    {loadingWorkspaces ? (
                      <View style={styles.loaderRow}>
                        <ActivityIndicator color={colors.primary} />
                        <Text style={styles.loaderText}>Loading companies…</Text>
                      </View>
                    ) : (
                      workspaces.map((workspace) => {
                        const key = `${driver.id}:${workspace.id}`;
                        const busy = assigningKey === key;
                        return (
                          <Pressable
                            key={workspace.id}
                            style={({ pressed }) => [
                              styles.workspaceButton,
                              pressed && styles.workspaceButtonPressed,
                              busy && styles.workspaceButtonDisabled,
                            ]}
                            onPress={() => void handleAssignDriver(driver, workspace)}
                            disabled={busy}
                          >
                            {busy ? (
                              <ActivityIndicator color={colors.surface} size="small" />
                            ) : (
                              <Text style={styles.workspaceButtonText}>{workspace.name}</Text>
                            )}
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 16,
    },
    headerRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    subtitle: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    refreshButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 4,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    refreshButtonPressed: {
      opacity: 0.85,
    },
    refreshText: {
      color: colors.text,
      fontWeight: '600',
    },
    driverList: {
      gap: 12,
    },
    driverRow: {
      gap: 8,
    },
    driverButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 4,
      backgroundColor: colors.surface,
    },
    driverButtonPressed: {
      opacity: 0.9,
    },
    driverButtonActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? '#102040' : '#eef2ff',
    },
    driverName: {
      fontWeight: '600',
      color: colors.text,
    },
    driverContact: {
      color: colors.mutedText,
      fontSize: 12,
    },
    driverHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    workspaceButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    workspaceButton: {
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
    },
    workspaceButtonPressed: {
      opacity: 0.85,
    },
    workspaceButtonDisabled: {
      opacity: 0.6,
    },
    workspaceButtonText: {
      color: colors.surface,
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
    emptyState: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
      backgroundColor: colors.surface,
    },
    emptyText: {
      color: colors.mutedText,
    },
    linkButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
    },
    linkButtonPressed: {
      opacity: 0.85,
    },
    linkButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    success: {
      color: colors.success,
      fontWeight: '600',
    },
    error: {
      color: colors.danger,
    },
  });
}

