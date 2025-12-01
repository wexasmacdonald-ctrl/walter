import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { AdminSummary } from '@/features/auth/types';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { useTheme } from '@/features/theme/theme-context';

type AdminTeamListProps = {
  refreshSignal?: number;
};

export function AdminTeamList({ refreshSignal }: AdminTeamListProps) {
  const { token, workspaceId, user, deleteUserAccount } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !workspaceId) {
      setAdmins([]);
      return;
    }
    const authToken = token;
    const workspaceScope = workspaceId;
    let cancelled = false;
    async function loadAdmins() {
      try {
        setLoading(true);
        setError(null);
        const result = await authApi.fetchAdmins(authToken, workspaceScope);
        if (!cancelled) {
          setAdmins(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            getFriendlyError(err, {
              fallback: "We couldn't load fellow admins. Try again shortly.",
            })
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadAdmins();
    return () => {
      cancelled = true;
    };
  }, [token, workspaceId, refreshSignal]);

  const formattedAdmins = useMemo(() => {
    if (!user) {
      return admins;
    }
    return admins.reduce<AdminSummary[]>((acc, admin) => {
      if (admin.id === user.id) {
        acc.unshift(admin);
      } else {
        acc.push(admin);
      }
      return acc;
    }, []);
  }, [admins, user]);

  const canDeleteAccounts = user?.role === 'dev';

  const handleDeleteAccount = async (admin: AdminSummary) => {
    setDeletingId(admin.id);
    try {
      await deleteUserAccount(admin.id);
      setAdmins((prev) => prev.filter((entry) => entry.id !== admin.id));
    } catch (err) {
      Alert.alert(
        'Delete failed',
        getFriendlyError(err, { fallback: "We couldn't delete that account. Try again." })
      );
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDeleteAccount = (admin: AdminSummary) => {
    Alert.alert(
      'Delete account?',
      `This permanently deletes ${admin.fullName || admin.emailOrPhone}. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => void handleDeleteAccount(admin),
        },
      ]
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Admin roster</Text>
      <Text style={styles.description}>
        Everyone who can manage drivers, routes, and user accounts.
      </Text>
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Refreshing roster…</Text>
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : formattedAdmins.length === 0 ? (
        <Text style={styles.muted}>No admins to display.</Text>
      ) : (
        formattedAdmins.map((admin) => (
          <View key={admin.id} style={styles.adminRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{getInitials(admin)}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{admin.fullName || admin.emailOrPhone}</Text>
              <Text style={styles.muted}>{admin.emailOrPhone}</Text>
            </View>
            {canDeleteAccounts ? (
              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.deleteButtonPressed,
                ]}
                onPress={() => confirmDeleteAccount(admin)}
                disabled={deletingId === admin.id}
              >
                <Text style={styles.deleteButtonText}>
                  {deletingId === admin.id ? 'Deleting…' : 'Delete account'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function getInitials(entry: { fullName: string | null; emailOrPhone: string }): string {
  if (entry.fullName && entry.fullName.trim().length > 0) {
    return entry.fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
  return entry.emailOrPhone?.[0]?.toUpperCase() ?? 'A';
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 16,
    },
    heading: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    description: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    adminRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#0f172a' : '#eff6ff',
    },
    badgeText: {
      color: colors.primary,
      fontWeight: '700',
    },
    info: {
      flex: 1,
    },
    name: {
      fontWeight: '600',
      color: colors.text,
    },
    muted: {
      color: colors.mutedText,
      fontSize: 12,
    },
    error: {
      color: colors.danger,
    },
    deleteButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    deleteButtonPressed: {
      backgroundColor: colors.dangerMuted,
    },
    deleteButtonText: {
      color: colors.danger,
      fontWeight: '600',
      fontSize: 12,
    },
  });
}
