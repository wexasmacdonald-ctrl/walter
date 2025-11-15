import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from './auth-context';
import type { UserRole } from './types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { type CredentialSharePayload, shareCredentials } from '@/features/shared/share-credentials';

type AdminCreateUserCardProps = {
  onUserCreated?: (role: UserRole) => void;
};

const ROLE_OPTIONS: Array<{ label: string; value: UserRole }> = [
  { label: 'Driver', value: 'driver' },
  { label: 'Admin', value: 'admin' },
  { label: 'Developer', value: 'dev' },
];

export function AdminCreateUserCard({ onUserCreated }: AdminCreateUserCardProps) {
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
  const [copying, setCopying] = useState(false);
  const [lastCredentials, setLastCredentials] = useState<CredentialSharePayload | null>(null);
  const nameInputRef = useRef<TextInput | null>(null);
  const contactInputRef = useRef<TextInput | null>(null);
  const supportsShare = Platform.OS !== 'web';

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
    if (!supportsShare) {
      return;
    }
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

  const copyPassword = async (value?: string | null) => {
    const passwordToCopy = value ?? tempPassword;
    if (!passwordToCopy || copying) {
      return;
    }
    setCopying(true);
    try {
      await Clipboard.setStringAsync(passwordToCopy);
      Alert.alert('Copied', 'Temporary password copied to your clipboard.');
    } catch (copyError) {
      console.warn('Failed to copy credentials', copyError);
      Alert.alert('Copy failed', 'Copy manually from the password field.');
    } finally {
      setCopying(false);
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
        fullName: prepared.fullName ?? undefined,
        emailOrPhone: prepared.emailOrPhone,
        role: prepared.role,
      });
      prepared.tempPassword = result.tempPassword;
      setTempPassword(result.tempPassword);
      setLastCredentials(prepared);
      if (supportsShare) {
        await shareMessage(prepared);
      }
      if (!supportsShare) {
        await copyPassword(result.tempPassword);
      }
      if (prepared.role === 'admin') {
        onUserCreated?.(prepared.role);
      }
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
          {ROLE_OPTIONS.map((option) => (
            <RoleButton
              key={option.value}
              label={option.label}
              selected={role === option.value}
              onPress={() => setRole(option.value)}
            />
          ))}
        </View>
        <Text style={styles.roleHint}>
          {role === 'driver'
            ? 'Drivers can only see their assigned stops.'
            : role === 'admin'
              ? 'Admins can manage drivers, addresses, and credentials.'
              : 'Developers get admin powers but stay hidden from the admin roster.'}
        </Text>
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
          <View style={styles.resultActions}>
            <Pressable
              style={({ pressed }) => [
                styles.copyButton,
                pressed && styles.copyButtonPressed,
                copying && styles.copyButtonDisabled,
              ]}
              disabled={copying}
              onPress={() => void copyPassword()}
            >
              {copying ? (
                <ActivityIndicator color={onPrimary} />
              ) : (
                <Text style={styles.copyButtonLabel}>Copy password</Text>
              )}
            </Pressable>
            {supportsShare ? (
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
                  <Text style={styles.shareButtonLabel}>Share message</Text>
                )}
              </Pressable>
            ) : null}
          </View>
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
      flexWrap: 'wrap',
    },
    roleHint: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
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
    resultActions: {
      flexDirection: Platform.OS === 'web' ? 'row' : 'column',
      gap: 12,
      marginTop: 12,
    },
    copyButton: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 20,
      alignItems: 'center',
      backgroundColor: colors.primary,
      flex: Platform.OS === 'web' ? 1 : undefined,
    },
    copyButtonPressed: {
      opacity: 0.85,
    },
    copyButtonDisabled: {
      opacity: 0.6,
    },
    copyButtonLabel: {
      color: onPrimary,
      fontWeight: '600',
    },
    shareButton: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 8,
      alignItems: 'center',
      backgroundColor: colors.surface,
      flex: Platform.OS === 'web' ? 1 : undefined,
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
