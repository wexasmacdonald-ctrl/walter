import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '@/features/auth/auth-context';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

type AdminInviteAdminCardProps = {
  onCreated?: () => void;
};

export function AdminInviteAdminCard({ onCreated }: AdminInviteAdminCardProps) {
  const { createUser } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [fullName, setFullName] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ label: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    const trimmedContact = contact.trim();
    if (trimmedContact.length === 0) {
      setError('Enter an email or phone number.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setCredentials(null);
    setCopied(false);
    try {
      const result = await createUser({
        fullName: fullName.trim() || undefined,
        emailOrPhone: trimmedContact,
        role: 'admin',
      });
      setCredentials({
        label: result.emailOrPhone,
        password: result.tempPassword,
      });
      setFullName('');
      setContact('');
      onCreated?.();
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't create that admin. Try again.",
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!credentials || copied) {
      return;
    }
    try {
      await Clipboard.setStringAsync(credentials.password);
      setCopied(true);
    } catch (err) {
      console.warn('Failed to copy admin password', err);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Invite a workspace admin</Text>
        <Text style={styles.subtitle}>
          Create a secure login for dispatchers or managers in this company. Share the temporary
          password immediately after creating the account.
        </Text>
      </View>
      <View style={styles.formField}>
        <Text style={styles.label}>Full name (optional)</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          placeholder="e.g. Jordan McKenzie"
          placeholderTextColor={colors.mutedText}
          onChangeText={setFullName}
          returnKeyType="next"
        />
      </View>
      <View style={styles.formField}>
        <Text style={styles.label}>Email or phone</Text>
        <TextInput
          style={styles.input}
          value={contact}
          onChangeText={setContact}
          placeholder="manager@example.com"
          placeholderTextColor={colors.mutedText}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.submitButton,
          pressed && styles.submitButtonPressed,
          submitting && styles.submitButtonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.submitButtonText}>Create admin login</Text>
        )}
      </Pressable>
      {credentials ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Share these credentials</Text>
          <View style={styles.resultRow}>
            <View style={styles.resultColumn}>
              <Text style={styles.resultHint}>Username</Text>
              <Text style={styles.resultValue}>{credentials.label}</Text>
            </View>
            <View style={styles.resultColumn}>
              <Text style={styles.resultHint}>Temporary password</Text>
              <Text style={styles.resultValue}>{credentials.password}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={handleCopyPassword}
            style={({ pressed }) => [
              styles.copyButton,
              pressed && styles.copyButtonPressed,
              copied && styles.copyButtonDisabled,
            ]}
          >
            <Text style={styles.copyButtonText}>{copied ? 'Password copied' : 'Copy password'}</Text>
          </Pressable>
          <Text style={styles.resultFootnote}>
            Password expires after first login. Share it via your preferred channel now.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const surfaceOn = isDark ? colors.background : colors.surface;
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 16,
      shadowColor: colors.overlay,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: Platform.OS === 'web' ? 0 : 0.08,
      shadowRadius: 20,
      elevation: 2,
    },
    header: {
      gap: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    subtitle: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    formField: {
      gap: 8,
    },
    label: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 14,
    },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    errorText: {
      color: colors.danger,
    },
    submitButton: {
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    submitButtonPressed: {
      opacity: 0.9,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: surfaceOn,
      fontWeight: '600',
    },
    resultCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
      padding: 16,
      gap: 12,
    },
    resultLabel: {
      color: colors.primary,
      fontWeight: '600',
    },
    resultRow: {
      flexDirection: Platform.OS === 'web' ? 'row' : 'column',
      gap: 12,
    },
    resultColumn: {
      flex: 1,
      gap: 4,
    },
    resultHint: {
      color: colors.mutedText,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    resultValue: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 16,
      fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    },
    copyButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    copyButtonPressed: {
      opacity: 0.9,
    },
    copyButtonDisabled: {
      opacity: 0.6,
    },
    copyButtonText: {
      color: surfaceOn,
      fontWeight: '600',
    },
    resultFootnote: {
      color: colors.mutedText,
      fontSize: 12,
    },
  });
}
