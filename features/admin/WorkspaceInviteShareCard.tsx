import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { WorkspaceInvite } from '@/features/auth/types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

export function WorkspaceInviteShareCard() {
  const { token, workspaceId, workspaceName } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [label, setLabel] = useState('');
  const canShare = Platform.OS !== 'web';
  const latestInvite = invites[0] ?? null;
  const currentWorkspaceLabel =
    (workspaceName && workspaceName.trim()) || (workspaceId ? `Workspace ${workspaceId.slice(0, 8)}` : 'Workspace');
  const inviteExpiryMs = 3 * 60 * 60 * 1000;

  const pruneInvites = useCallback((list: WorkspaceInvite[]) => {
    const now = Date.now();
    const filtered = list.filter((invite) => {
      if (!invite.expiresAt) {
        return true;
      }
      const expires = new Date(invite.expiresAt).getTime();
      return Number.isFinite(expires) && expires > now;
    });
    return filtered.slice(0, 1);
  }, []);

  const loadInvites = useCallback(async () => {
    if (!token || !workspaceId) {
      setInvites([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.getWorkspaceInvites(token, workspaceId);
      setInvites(pruneInvites(result));
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't load invite codes for this workspace.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const handleGenerateInvite = async () => {
    if (!token || !workspaceId || creating) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const payload: Record<string, string> = {};
      const trimmed = label.trim();
      if (trimmed.length > 0) {
        payload.label = trimmed;
      }
      payload.expiresAt = new Date(Date.now() + inviteExpiryMs).toISOString();
      const invite = await authApi.createWorkspaceInviteCode(token, workspaceId, payload);
      setInvites([invite]);
      setLabel('');
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't create that invite right now. Try again.",
        })
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!latestInvite || copying) {
      return;
    }
    setCopying(true);
    try {
      await Clipboard.setStringAsync(latestInvite.code);
      Alert.alert('Invite copied', `Share it with your team to join ${currentWorkspaceLabel}.`);
    } catch (err) {
      Alert.alert('Copy failed', 'Copy the code manually and try again.');
    } finally {
      setCopying(false);
    }
  };

  const handleShare = async () => {
    if (!latestInvite || sharing || !canShare) {
      return;
    }
    setSharing(true);
    try {
      await Share.share({
        message: `Join ${currentWorkspaceLabel} in Pin Planner with this invite code: ${latestInvite.code}`,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('No Activity found')) {
        Alert.alert('Sharing unavailable', 'Use the copy button to send this code.');
      }
    } finally {
      setSharing(false);
    }
  };

  const renderInviteBody = () => {
    if (loading) {
      return (
        <View style={styles.loaderRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loaderText}>Loading invite codes...</Text>
        </View>
      );
    }
    if (!latestInvite) {
      return (
        <Text style={styles.emptyText}>
          Generate an invite to onboard dispatchers and drivers into {currentWorkspaceLabel}.
        </Text>
      );
    }
    return (
      <>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Latest invite</Text>
          <Text style={styles.codeValue}>{latestInvite.code}</Text>
          <Text style={styles.codeMeta}>
            {latestInvite.expiresAt ? `Expires ${formatDate(latestInvite.expiresAt)}` : 'Valid for 3 hours'}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
                copying && styles.secondaryButtonDisabled,
              ]}
              onPress={handleCopy}
              disabled={copying}
            >
              {copying ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Copy code</Text>
              )}
            </Pressable>
            {canShare ? (
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                  sharing && styles.secondaryButtonDisabled,
                ]}
                onPress={handleShare}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Share invite</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
        {/* Previous codes suppressed */}
      </>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleColumn}>
          <Text style={styles.title}>Workspace invites</Text>
        </View>
        {workspaceId ? (
          <View style={styles.workspaceBadge}>
            <Text style={styles.workspaceBadgeLabel}>Workspace</Text>
            <Text style={styles.workspaceBadgeValue}>{currentWorkspaceLabel}</Text>
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {renderInviteBody()}
      <View style={styles.divider} />
      <View style={styles.formField}>
        <Text style={styles.label}>Invite label (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Dispatch managers"
          placeholderTextColor={colors.mutedText}
          autoCapitalize="words"
          value={label}
          onChangeText={setLabel}
        />
      </View>
      <View style={styles.ctaRow}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            (creating || !workspaceId || !token) && styles.primaryButtonDisabled,
          ]}
          onPress={handleGenerateInvite}
          disabled={creating || !workspaceId || !token}
        >
          {creating ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {latestInvite ? 'Generate new code' : 'Create invite code'}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.linkButton,
            pressed && styles.linkButtonPressed,
            loading && styles.linkButtonDisabled,
          ]}
          onPress={() => void loadInvites()}
          disabled={loading}
        >
          <Text style={styles.linkButtonText}>Refresh</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 16,
      shadowColor: colors.overlay,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: Platform.OS === 'web' ? 0 : 0.08,
      shadowRadius: 24,
      elevation: 2,
    },
    titleRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    },
    titleColumn: {
      flex: 1,
      gap: 8,
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
    subtitleHighlight: {
      color: colors.text,
      fontWeight: '600',
    },
    workspaceBadge: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? '#13233c' : '#f8fafc',
      gap: 4,
      minWidth: 180,
    },
    workspaceBadgeLabel: {
      color: colors.mutedText,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    workspaceBadgeValue: {
      color: colors.text,
      fontWeight: '600',
    },
    errorText: {
      color: colors.danger,
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
    codeCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
      backgroundColor: isDark ? '#0f172a' : colors.primaryMuted,
    },
    codeLabel: {
      color: colors.mutedText,
      fontWeight: '600',
      textTransform: 'uppercase',
      fontSize: 12,
      letterSpacing: 0.8,
    },
    codeValue: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 2,
    },
    codeMeta: {
      color: colors.mutedText,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
    },
    secondaryButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.surface,
      flexGrow: 1,
      alignItems: 'center',
    },
    secondaryButtonPressed: {
      opacity: 0.85,
    },
    secondaryButtonDisabled: {
      opacity: 0.5,
    },
    secondaryButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    history: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 8,
      backgroundColor: colors.surface,
    },
    historyTitle: {
      color: colors.text,
      fontWeight: '600',
    },
    historyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    historyCode: {
      color: colors.text,
      fontWeight: '600',
    },
    historyMeta: {
      color: colors.mutedText,
      fontSize: 12,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    formField: {
      gap: 8,
    },
    label: {
      color: colors.text,
      fontWeight: '600',
    },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    ctaRow: {
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
    },
    primaryButton: {
      borderRadius: 999,
      paddingVertical: 14,
      paddingHorizontal: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      flexGrow: 1,
    },
    primaryButtonPressed: {
      opacity: 0.9,
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      color: colors.surface,
      fontWeight: '600',
    },
    linkButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkButtonPressed: {
      opacity: 0.85,
    },
    linkButtonDisabled: {
      opacity: 0.6,
    },
    linkButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
  });
}





