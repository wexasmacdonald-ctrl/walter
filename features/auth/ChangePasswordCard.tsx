import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from './auth-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { useTheme } from '@/features/theme/theme-context';

export function ChangePasswordCard() {
  const { changePassword } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const currentPasswordRef = useRef<TextInput | null>(null);
  const newPasswordRef = useRef<TextInput | null>(null);
  const confirmPasswordRef = useRef<TextInput | null>(null);

  const handleSubmit = async () => {
    if (loading) {
      return;
    }
    if (!currentPassword || !newPassword) {
      setError('Enter your current password and a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setStatus('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't update your password. Try again.",
        })
      );
      setStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Change password</Text>
      <Text style={styles.subtitle}>You can update your password at any time.</Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Current password</Text>
        <TextInput
          ref={currentPasswordRef}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          style={styles.input}
          placeholder="Current password"
          placeholderTextColor={colors.mutedText}
          editable={!loading}
          returnKeyType="next"
          onSubmitEditing={() => newPasswordRef.current?.focus()}
          blurOnSubmit={false}
          accessibilityLabel="Current password"
        />
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.fieldColumn}>
          <Text style={styles.label}>New password</Text>
          <TextInput
            ref={newPasswordRef}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={colors.mutedText}
            editable={!loading}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            blurOnSubmit={false}
            accessibilityLabel="New password"
          />
        </View>
        <View style={styles.fieldColumn}>
          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            ref={confirmPasswordRef}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor={colors.mutedText}
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            accessibilityLabel="Confirm new password"
          />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status === 'success' ? <Text style={styles.success}>Password updated.</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleSubmit}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Update password"
      >
        {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonLabel}>Update password</Text>}
      </Pressable>
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
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    subtitle: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    fieldGroup: {
      gap: 6,
    },
    fieldRow: {
      flexDirection: 'row',
      gap: 12,
    },
    fieldColumn: {
      flex: 1,
      gap: 6,
    },
    label: {
      fontWeight: '600',
      color: colors.text,
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      backgroundColor: isDark ? colors.background : '#f8fafc',
      color: colors.text,
    },
    error: {
      color: colors.danger,
    },
    success: {
      color: colors.success ?? '#16a34a',
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPressed: {
      opacity: 0.85,
    },
    buttonLabel: {
      color: colors.surface,
      fontWeight: '600',
      fontSize: 16,
    },
  });
}
