import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { DevUserSummary } from '@/features/auth/types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

type DevImpersonationPanelProps = {
  refreshSignal?: number;
};

export function DevImpersonationPanel({ refreshSignal }: DevImpersonationPanelProps) {
  const {
    token,
    user,
    impersonatorSession,
    isImpersonating,
    impersonateUser,
    endImpersonation,
  } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [users, setUsers] = useState<DevUserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await authApi.fetchDevUsers(token);
      setUsers(list);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't load accounts right now. Pull to refresh in a moment.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (expanded) {
      void loadUsers();
    }
  }, [expanded, loadUsers, refreshSignal]);

  useEffect(() => {
    if (!expanded) {
      setSearchQuery('');
    }
  }, [expanded]);

  const handleViewAs = async (targetId: string) => {
    if (!targetId) {
      return;
    }
    setBusyId(targetId);
    setError(null);
    setMessage(null);
    try {
      await impersonateUser(targetId);
      setMessage('Now viewing the app exactly how they see it.');
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: 'We could not switch accounts. Return to dev mode and try again.',
        })
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (targetId: string) => {
    if (!token) {
      return;
    }
    const target = users.find((entry) => entry.id === targetId);
    if (!target) {
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Delete account?',
        `Permanently delete ${target.fullName || target.emailOrPhone || 'this user'}?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    });
    if (!confirmed) {
      return;
    }
    setDeletingId(targetId);
    setError(null);
    setMessage(null);
    try {
      await authApi.deleteUserAccount(token, targetId);
      setUsers((prev) => prev.filter((entry) => entry.id !== targetId));
      setMessage('Account deleted.');
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: 'Could not delete that account. Try again.',
        })
      );
    } finally {
      setDeletingId(null);
    }
  };

  const viewingAsLabel = isImpersonating
    ? user?.fullName || user?.emailOrPhone || 'Unknown user'
    : null;

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return users;
    }
    return users.filter((entry) => {
      const name = entry.fullName?.toLowerCase() ?? '';
      const contact = entry.emailOrPhone?.toLowerCase() ?? '';
      const workspace = entry.workspaceId?.toLowerCase() ?? '';
      return name.includes(query) || contact.includes(query) || workspace.includes(query);
    });
  }, [users, searchQuery]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title}>View as user</Text>
          <Text style={styles.subtitle}>
            Open the list, select a person, and a new session loads instantly without sharing
            passwords.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.toggleButton, pressed && styles.toggleButtonPressed]}
          onPress={() => setExpanded((prev) => !prev)}
        >
          <Text style={styles.toggleButtonText}>{expanded ? 'Hide list' : 'Open list'}</Text>
        </Pressable>
      </View>

      {viewingAsLabel ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Viewing as {viewingAsLabel}</Text>
          <Pressable
            style={({ pressed }) => [styles.returnButton, pressed && styles.returnButtonPressed]}
            onPress={() => void endImpersonation()}
          >
            <Text style={styles.returnButtonText}>Return to dev</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {expanded ? (
        <View style={styles.listSection}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name, email, or workspace"
            placeholderTextColor={colors.mutedText}
          />
          {loading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loaderText}>Loading accounts...</Text>
            </View>
          ) : filteredUsers.length === 0 ? (
            <Text style={styles.emptyText}>
              {users.length === 0 ? 'No accounts found.' : 'No matches. Try another search.'}
            </Text>
          ) : (
            filteredUsers.map((entry) => {
              const isCurrentUser = entry.id === user?.id;
              const disabled = busyId === entry.id || isCurrentUser;
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.userRow,
                    isCurrentUser && styles.userRowActive,
                    entry.role === 'dev' && styles.userRowDisabled,
                  ]}
                >
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>
                      {entry.fullName || entry.emailOrPhone || 'Unnamed user'}
                    </Text>
                    <Text style={styles.userMeta}>{entry.emailOrPhone}</Text>
                <Text style={styles.userMeta}>
                  {entry.role.toUpperCase()}
                  {entry.workspaceId ? ` • ${entry.workspaceId}` : ' • Free tier'}
                </Text>
                <Text style={styles.userMeta}>
                  Last active {formatLastActive(entry.lastActiveAt)}
                </Text>
              </View>
                  <View style={styles.userActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.viewButton,
                        pressed && styles.viewButtonPressed,
                        (disabled || entry.role === 'dev') && styles.viewButtonDisabled,
                      ]}
                      disabled={disabled || entry.role === 'dev'}
                      onPress={() => void handleViewAs(entry.id)}
                    >
                      {busyId === entry.id ? (
                        <ActivityIndicator color={colors.surface} size="small" />
                      ) : (
                        <Text style={styles.viewButtonText}>
                          {entry.role === 'dev' ? 'Dev account' : isCurrentUser ? 'Active' : 'View as'}
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed && styles.deleteButtonPressed,
                        deletingId === entry.id && styles.deleteButtonDisabled,
                      ]}
                      disabled={deletingId === entry.id || entry.role === 'dev'}
                      onPress={() => void handleDeleteUser(entry.id)}
                    >
                      {deletingId === entry.id ? (
                        <ActivityIndicator color={colors.surface} size="small" />
                      ) : (
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : (
        <Text style={styles.collapsedHint}>Tap "Open list" to pick someone to impersonate.</Text>
      )}
    </View>
  );
}

function formatLastActive(timestamp: string | null): string {
  if (!timestamp) {
    return 'not recorded';
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'not recorded';
  }
  const diffInMs = Date.now() - parsed.getTime();
  if (diffInMs < 60_000) {
    return 'just now';
  }
  const minutes = Math.floor(diffInMs / 60_000);
  if (minutes < 60) {
    return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateFormatter.format(parsed)} at ${timeFormatter.format(parsed)}`;
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 12,
    },
    headerRow: {
      flexDirection: 'row',
      gap: 12,
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    subtitle: {
      color: colors.mutedText,
    },
    toggleButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleButtonPressed: {
      opacity: 0.85,
    },
    toggleButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    listSection: {
      gap: 10,
    },
    searchInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: colors.text,
      backgroundColor: colors.surface,
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
    userRow: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    userRowActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? '#0f172a' : '#eef2ff',
    },
  userRowDisabled: {
    opacity: 0.6,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
    userActions: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 8,
    },
  userName: {
    color: colors.text,
    fontWeight: '600',
  },
    userMeta: {
      color: colors.mutedText,
      fontSize: 12,
    },
    viewButton: {
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    viewButtonPressed: {
      opacity: 0.85,
    },
    viewButtonDisabled: {
      backgroundColor: colors.border,
    },
  viewButtonText: {
    color: colors.surface,
    fontWeight: '600',
  },
    deleteButton: {
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.danger,
      alignSelf: 'flex-start',
      alignItems: 'center',
      justifyContent: 'center',
    },
  deleteButtonPressed: {
    opacity: 0.85,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: colors.surface,
    fontWeight: '600',
  },
    collapsedHint: {
      color: colors.mutedText,
      fontStyle: 'italic',
    },
    success: {
      color: colors.success,
      fontWeight: '600',
    },
    error: {
      color: colors.danger,
    },
    banner: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 8,
      backgroundColor: isDark ? '#102840' : '#e0f2fe',
    },
    bannerText: {
      color: isDark ? colors.surface : '#0f172a',
      fontWeight: '600',
    },
    returnButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      paddingHorizontal: 14,
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
    },
    returnButtonPressed: {
      opacity: 0.85,
    },
    returnButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
  });
}
