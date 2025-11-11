import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { AdminSummary } from '@/features/auth/types';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { useTheme } from '@/features/theme/theme-context';

type AdminTeamListProps = {
  refreshSignal?: number;
};

export function AdminTeamList({ refreshSignal }: AdminTeamListProps) {
  const { token, user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    async function loadAdmins() {
      try {
        setLoading(true);
        setError(null);
        const result = await authApi.fetchAdmins(token);
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
  }, [token, refreshSignal]);

  const otherAdmins = useMemo(
    () => admins.filter((admin) => admin.id !== user?.id),
    [admins, user?.id]
  );

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Admin roster</Text>
      <Text style={styles.description}>
        Everyone who can manage drivers, routes, and user accounts.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>You</Text>
        <View style={styles.adminRow}>
          <View style={styles.initialBadge}>
            <Text style={styles.initialText}>
              {getInitials({
                id: user?.id ?? 'me',
                fullName: user?.fullName ?? null,
                emailOrPhone: user?.emailOrPhone ?? 'you',
              })}
            </Text>
          </View>
          <View style={styles.adminInfo}>
            <Text style={styles.name}>
              {user?.fullName || user?.emailOrPhone || 'Current admin'}
            </Text>
            <Text style={styles.sub}>
              {user?.emailOrPhone || 'No contact info on file'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.section, styles.sectionHeader]}>
        <Text style={styles.sectionLabel}>Other admins</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{otherAdmins.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Updating roster…</Text>
        </View>
      ) : otherAdmins.length === 0 ? (
        <Text style={styles.emptyText}>
          {admins.length <= 1
            ? "You're the only admin right now."
            : 'No other admins to show.'}
        </Text>
      ) : (
        otherAdmins.map((admin) => (
          <View key={admin.id} style={styles.adminRow}>
            <View style={styles.initialBadge}>
              <Text style={styles.initialText}>{getInitials(admin)}</Text>
            </View>
            <View style={styles.adminInfo}>
              <Text style={styles.name}>{admin.fullName || admin.emailOrPhone}</Text>
              <Text style={styles.sub}>{admin.emailOrPhone}</Text>
            </View>
          </View>
        ))
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function getInitials(admin: AdminSummary): string {
  const source = admin.fullName || admin.emailOrPhone || '';
  const initials = source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || 'A';
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
    heading: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    description: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    section: {
      gap: 8,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionLabel: {
      fontWeight: '600',
      color: colors.text,
      textTransform: 'uppercase',
      fontSize: 12,
      letterSpacing: 0.6,
    },
    adminRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    adminInfo: {
      flex: 1,
    },
    name: {
      color: colors.text,
      fontWeight: '600',
    },
    sub: {
      color: colors.mutedText,
      fontSize: 12,
    },
    initialBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#1e293b' : '#e0f2fe',
    },
    initialText: {
      color: isDark ? colors.primary : '#0f172a',
      fontWeight: '600',
    },
    countBadge: {
      minWidth: 28,
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    countText: {
      color: isDark ? colors.background : colors.surface,
      fontWeight: '600',
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    loadingText: {
      color: colors.mutedText,
    },
    emptyText: {
      color: colors.mutedText,
      fontStyle: 'italic',
    },
    error: {
      color: colors.danger,
    },
  });
}
