import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { WorkspaceInvite } from '@/features/auth/types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

export function WorkspaceInviteShareCard() {
  const { token, workspaceId } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canShare = Platform.OS !== 'web';
  const latestInvite = invites[0] ?? null;

  const loadInvites = useCallback(async () => {
    if (!token || !workspaceId) {
      setInvites([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.getWorkspaceInvites(token, workspaceId);
      setInvites(result);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't load your invite code. Try again soon.",
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
      const invite = await authApi.createWorkspaceInviteCode(token, workspaceId, {});
      setInvites((prev) => [invite, ...prev]);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't create a code right now. Try again.",
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
      Alert.alert('Company code copied', 'Share it with drivers so they can unlock your workspace.');
    } catch (err) {
      Alert.alert('Copy failed', 'Copy the invite code manually.');
    } finally {
      setCopying(false);
    }
  };

  const handleShare = async () => {
    if (!latestInvite || !canShare || sharing) {
      return;
    }
    setSharing(true);
    try {
      await Share.share({
        message: `Join our workspace in Pin Planner using this invite code: ${latestInvite.code}`,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('No Activity found')) {
        Alert.alert('Sharing unavailable', 'Use the copy button to share this code instead.');
      }
    } finally {
      setSharing(false);
    }
  };

  const renderInviteDetails = () => {
    if (loading) {
      return (
        <View style={styles.loaderRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loaderText}>Loading invite code…</Text>
        </View>
      );
    }
    if (!latestInvite) {
      return (
        <Text style={styles.emptyText}>
          Generate a code to invite dispatchers or drivers. Every driver enters it in Settings to
          unlock the business tier.
        </Text>
      );
    }
    return (
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Current invite code</Text>
        <Text style={styles.codeValue}>{latestInvite.code}</Text>
        <Text style={styles.codeMeta}>
          {latestInvite.maxUses
            ? `${latestInvite.uses}/${latestInvite.maxUses} uses`
            : `${latestInvite.uses} use${latestInvite.uses === 1 ? '' : 's'} so far`}
          {latestInvite.expiresAt ? ` · Expires ${formatDate(latestInvite.expiresAt)}` : ''}
        </Text>
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
              copying && styles.secondaryButtonDisabled,
            ]}
            onPress={() => void handleCopy()}
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
              onPress={() => void handleShare()}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Share link</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Share company code</Text>
      <Text style={styles.subtitle}>
        Drivers unlock your workspace by entering this invite in Settings › Plan & team.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {renderInviteDetails()}
      <View style={styles.ctaRow}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            creating && styles.primaryButtonDisabled,
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
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 12,
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
    error: {
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
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
      backgroundColor: isDark ? '#0f172a' : colors.primaryMuted,
    },
    codeLabel: {
      fontWeight: '600',
      color: colors.mutedText,
      textTransform: 'uppercase',
      fontSize: 12,
      letterSpacing: 0.8,
    },
    codeValue: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 2,
    },
    codeMeta: {
      color: colors.mutedText,
    },
    buttonRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 4,
    },
    ctaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
    primaryButton: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
    },
    primaryButtonPressed: {
      opacity: 0.9,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: colors.surface,
      fontWeight: '600',
    },
    secondaryButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
      flexGrow: 1,
      alignItems: 'center',
    },
    secondaryButtonPressed: {
      opacity: 0.85,
    },
    secondaryButtonDisabled: {
      opacity: 0.6,
    },
    secondaryButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    linkButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
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
      fontSize: 13,
    },
  });
}

