import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { AccessRequest } from '@/features/auth/types';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { useTheme } from '@/features/theme/theme-context';

type AdminAccessRequestsProps = {
  refreshSignal?: number;
};

export function AdminAccessRequests({ refreshSignal }: AdminAccessRequestsProps) {
  const { token, workspaceId } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !workspaceId) {
      setRequests([]);
      return;
    }
    const workspace = workspaceId;
    const authToken = token;
    let cancelled = false;
    async function loadRequests() {
      try {
        setLoading(true);
        setError(null);
        const data = await authApi.listAccessRequests(authToken, workspace);
        if (!cancelled) {
          setRequests(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            getFriendlyError(err, { fallback: "We couldn't load access requests. Try again shortly." })
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadRequests();
    return () => {
      cancelled = true;
    };
  }, [token, workspaceId, refreshSignal]);

  const handleResolve = async (request: AccessRequest, resolution: 'approve' | 'decline') => {
    if (!token || !workspaceId) {
      return;
    }
    const workspace = workspaceId;
    const authToken = token;
    setResolvingId(request.id);
    try {
      await authApi.resolveAccessRequest(authToken, request.id, resolution, workspace);
      setRequests((prev) => prev.filter((entry) => entry.id !== request.id));
    } catch (err) {
      setError(getFriendlyError(err, { fallback: 'Could not update that request. Try again.' }));
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Access requests</Text>
      <Text style={styles.description}>
        Drivers who want to join this workspace using an admin email or phone number.
      </Text>
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.subtle}>Loading requests...</Text>
        </View>
      ) : requests.length === 0 ? (
        <Text style={styles.subtle}>No pending requests.</Text>
      ) : (
        requests.map((request) => {
          const buttonBusy = resolvingId === request.id;
          return (
            <View key={request.id} style={styles.requestRow}>
              <View style={styles.requestInfo}>
                <Text style={styles.name}>{request.requesterName || 'Driver'}</Text>
                <Text style={styles.subtle}>{request.requesterContact || 'No contact on file'}</Text>
                {request.createdAt ? (
                  <Text style={styles.timestamp}>Requested on {new Date(request.createdAt).toLocaleString()}</Text>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void handleResolve(request, 'decline')}
                  disabled={buttonBusy}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.secondary,
                    pressed && styles.pressed,
                    buttonBusy && styles.disabled,
                  ]}
                >
                  <Text style={styles.secondaryText}>{buttonBusy ? 'Working...' : 'Decline'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleResolve(request, 'approve')}
                  disabled={buttonBusy}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.primary,
                    pressed && styles.pressed,
                    buttonBusy && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryText}>{buttonBusy ? 'Working...' : 'Approve'}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
      padding: 16,
      gap: 12,
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
    subtle: {
      color: colors.mutedText,
      fontSize: 12,
    },
    requestRow: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      gap: 8,
      backgroundColor: isDark ? '#0f172a' : '#f8fafc',
    },
    requestInfo: {
      gap: 4,
    },
    name: {
      color: colors.text,
      fontWeight: '600',
    },
    timestamp: {
      color: colors.mutedText,
      fontSize: 12,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
    },
    primary: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    secondary: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.6,
    },
    primaryText: {
      color: isDark ? colors.background : colors.surface,
      fontWeight: '600',
    },
    secondaryText: {
      color: colors.text,
      fontWeight: '600',
    },
    error: {
      color: colors.danger,
    },
  });
}
