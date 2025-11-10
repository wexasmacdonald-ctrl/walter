import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from './auth-context';
import type { UserRole } from './types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { type CredentialSharePayload, shareCredentials } from '@/features/shared/share-credentials';

export function AdminCreateUserCard() {
  const { createUser } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const placeholderColor = colors.mutedText;
  const onPrimary = isDark ? colors.background : colors.surface;
  const [fullName, setFullName] = useState('');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [role, setRole] = useState<UserRole>('driver');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [lastCredentials, setLastCredentials] = useState<CredentialSharePayload | null>(null);
  const nameInputRef = useRef<TextInput | null>(null);
  const contactInputRef = useRef<TextInput | null>(null);

  const RoleButton = ({ label, selected, onPress }: RoleButtonProps) => (
    <Pressable
      style={({ pressed }) => [
        styles.roleButton,
        selected && styles.roleButtonSelected,
        pressed && styles.roleButtonPressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.roleButtonLabel, selected && styles.roleButtonLabelSelected]}>{label}</Text>
    </Pressable>
  );

  const resetForm = () => {
    setFullName('');
    setEmailOrPhone('');
    setRole('driver');
  };

  const shareMessage = async (payload?: CredentialSharePayload) => {
    const details = payload ?? lastCredentials;
    if (!details || sharing) {
      return;
    }
    setSharing(true);
    try {
      await shareCredentials(details);
    } catch (shareError) {
      console.warn('Failed to share credentials', shareError);
      Alert.alert(
        'Message not shared',
        'Credentials were created, but the share sheet could not open. Copy the password above or try again.'
      );
    } finally {
      setSharing(false);
    }
  };

  const handleSubmit = async () => {
    if (loading) {
      return;
    }
    setError(null);
    setTempPassword(null);
    setLoading(true);
    try {
      const prepared: CredentialSharePayload = {
        fullName: fullName.trim() || null,
        emailOrPhone: emailOrPhone.trim(),
        role,
        tempPassword: '',
      };
      const result = await createUser({
        fullName: prepared.fullName ?? '',
        emailOrPhone: prepared.emailOrPhone,
        role: prepared.role,
      });
      prepared.tempPassword = result.tempPassword;
      setTempPassword(result.tempPassword);
      setLastCredentials(prepared);
      await shareMessage(prepared);
      resetForm();
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't create that login. Try again.",
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Create employee login</Text>
      <Text style={styles.subtitle}>
        Generate credentials for a driver or another admin. Share the temporary password right away—
        they can change it later.
      </Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          ref={nameInputRef}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Employee name"
          style={styles.input}
          editable={!loading}
          placeholderTextColor={placeholderColor}
          returnKeyType="next"
          onSubmitEditing={() => contactInputRef.current?.focus()}
          blurOnSubmit={false}
        />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Email or phone</Text>
        <TextInput
          ref={contactInputRef}
          value={emailOrPhone}
          onChangeText={setEmailOrPhone}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="email/phone"
          style={styles.input}
          editable={!loading}
          placeholderTextColor={placeholderColor}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
      </View>
      <View style={styles.roleGroup}>
        <Text style={styles.label}>Role</Text>
        <View style={styles.roleButtons}>
          <RoleButton label="Driver" selected={role === 'driver'} onPress={() => setRole('driver')} />
          <RoleButton label="Admin" selected={role === 'admin'} onPress={() => setRole('admin')} />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={onPrimary} />
        ) : (
          <Text style={styles.buttonLabel}>Create account</Text>
        )}
      </Pressable>
      {tempPassword ? (
        <View style={styles.result}>
          <Text style={styles.resultLabel}>Temporary password</Text>
          <Text style={styles.resultValue}>{tempPassword}</Text>
          <Text style={styles.resultHint}>
            Share this message or copy the password below so they can sign in and change it later.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.shareButton,
              pressed && styles.shareButtonPressed,
              sharing && styles.shareButtonDisabled,
            ]}
            disabled={sharing}
            onPress={() => void shareMessage()}
          >
            {sharing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.shareButtonLabel}>Share message again</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type RoleButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const onPrimary = isDark ? colors.background : colors.surface;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 20,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
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
    fieldGroup: {
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
      color: colors.text,
      backgroundColor: colors.surface,
    },
    roleGroup: {
      gap: 8,
    },
    roleButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    roleButton: {
      flex: 1,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    roleButtonSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    roleButtonPressed: {
      opacity: 0.9,
    },
    roleButtonLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    roleButtonLabelSelected: {
      color: onPrimary,
    },
    error: {
      color: colors.danger,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    buttonPressed: {
      opacity: 0.85,
    },
    buttonLabel: {
      color: onPrimary,
      fontWeight: '600',
      fontSize: 16,
    },
    result: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
      padding: 14,
      gap: 6,
    },
    resultLabel: {
      fontWeight: '600',
      color: colors.primary,
    },
    resultValue: {
      fontFamily: 'monospace',
      fontSize: 18,
      color: colors.text,
    },
    resultHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    shareButton: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 8,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    shareButtonPressed: {
      opacity: 0.85,
    },
    shareButtonDisabled: {
      opacity: 0.6,
    },
    shareButtonLabel: {
      color: colors.primary,
      fontWeight: '600',
    },
  });
}
