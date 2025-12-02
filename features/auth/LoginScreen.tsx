import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { openPrivacyPolicy, openTermsOfUse } from '@/features/legal/legal-documents';
import { useTheme } from '@/features/theme/theme-context';
import { useAuth } from './auth-context';

export function LoginScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const isWeb = Platform.OS === 'web';
  const heroGradient = isDark
    ? ['#050816', '#0b132b', '#050816']
    : ['#eef2fb', '#ffffff', '#eef2fb'];

  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [contact, setContact] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [rememberDevice, setRememberDevice] = useState(false);
  const identifierInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);
  const registerNameRef = useRef<TextInput | null>(null);
  const registerContactRef = useRef<TextInput | null>(null);
  const registerPasswordRef = useRef<TextInput | null>(null);
  const registerConfirmRef = useRef<TextInput | null>(null);

  const isRegisterMode = mode === 'register';
  const placeholderColor = colors.mutedText;

  const switchMode = (nextMode: 'login' | 'register') => {
    if (mode === nextMode) {
      return;
    }
    setMode(nextMode);
    setLoginError(null);
    setRegisterError(null);
  };

  const handleLogin = async () => {
    if (loginSubmitting) {
      return;
    }
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setLoginError('Enter your email or phone number.');
      identifierInputRef.current?.focus();
      return;
    }
    if (!password) {
      setLoginError('Enter your password.');
      passwordInputRef.current?.focus();
      return;
    }
    setLoginError(null);
    setLoginSubmitting(true);
    try {
      await signIn(trimmedIdentifier, password, { remember: rememberDevice });
      setPassword('');
    } catch (error) {
      setLoginError(
        getFriendlyError(error, {
          fallback: "We couldn't sign you in. Check your email or password and try again.",
        })
      );
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleRegister = async () => {
    if (registerSubmitting) {
      return;
    }
    const trimmedContact = contact.trim();
    if (!trimmedContact) {
      setRegisterError('Enter your email or phone number.');
      registerContactRef.current?.focus();
      return;
    }
    if (newPassword.length < 8) {
      setRegisterError('Password must be at least 8 characters.');
      registerPasswordRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setRegisterError('Passwords do not match.');
      registerConfirmRef.current?.focus();
      return;
    }
    setRegisterError(null);
    setRegisterSubmitting(true);
    try {
      await register({
        fullName: fullName.trim() || null,
        emailOrPhone: trimmedContact,
        password: newPassword,
      });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setRegisterError(
        getFriendlyError(error, {
          fallback: "We couldn't create your account. Try again in a moment.",
        })
      );
    } finally {
      setRegisterSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? 40 : 0}
      style={styles.screen}
    >
      <LinearGradient colors={heroGradient} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <AppHeader />
        <ScrollView
          contentContainerStyle={[styles.container, isWeb && styles.containerWeb]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          <View style={[styles.formSurface, isWeb && styles.formSurfaceWeb]}>
            <Text style={styles.title}>{isRegisterMode ? 'Create your account' : 'Sign in'}</Text>
            {!isRegisterMode ? (
              <Text style={styles.accessNote}>Use the email or phone you registered with.</Text>
            ) : null}
            <View style={styles.modeSwitch}>
              <Pressable
                style={({ pressed }) => [
                  styles.modeButton,
                  mode === 'login' && styles.modeButtonActive,
                  pressed && styles.modeButtonPressed,
                ]}
                onPress={() => switchMode('login')}
              >
                <Text
                  style={[styles.modeButtonLabel, mode === 'login' && styles.modeButtonLabelActive]}
                >
                  Sign in
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modeButton,
                  mode === 'register' && styles.modeButtonActive,
                  pressed && styles.modeButtonPressed,
                ]}
                onPress={() => switchMode('register')}
              >
                <Text
                  style={[
                    styles.modeButtonLabel,
                    mode === 'register' && styles.modeButtonLabelActive,
                  ]}
                >
                  Create account
                </Text>
              </Pressable>
            </View>
            {isRegisterMode ? (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Full name</Text>
                  <TextInput
                    ref={registerNameRef}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    textContentType="name"
                    placeholder="Jane Smith"
                    placeholderTextColor={placeholderColor}
                    style={styles.input}
                    editable={!registerSubmitting}
                    returnKeyType="next"
                    onSubmitEditing={() => registerContactRef.current?.focus()}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email or phone</Text>
                  <TextInput
                    ref={registerContactRef}
                    value={contact}
                    onChangeText={setContact}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    keyboardType="email-address"
                    placeholder="you@example.com"
                    placeholderTextColor={placeholderColor}
                    style={styles.input}
                    editable={!registerSubmitting}
                    returnKeyType="next"
                    onSubmitEditing={() => registerPasswordRef.current?.focus()}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    ref={registerPasswordRef}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    textContentType="newPassword"
                    placeholder="********"
                    placeholderTextColor={placeholderColor}
                    style={styles.input}
                    editable={!registerSubmitting}
                    returnKeyType="next"
                    onSubmitEditing={() => registerConfirmRef.current?.focus()}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirm password</Text>
                  <TextInput
                    ref={registerConfirmRef}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    textContentType="password"
                    placeholder="********"
                    placeholderTextColor={placeholderColor}
                    style={styles.input}
                    editable={!registerSubmitting}
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                  />
                </View>
                {registerError ? <Text style={styles.error}>{registerError}</Text> : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                    registerSubmitting && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleRegister}
                  disabled={registerSubmitting}
                >
                  {registerSubmitting ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create account</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email or phone</Text>
                  <TextInput
                    ref={identifierInputRef}
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    keyboardType="email-address"
                    placeholder="driver@example.com"
                    placeholderTextColor={placeholderColor}
                    style={styles.input}
                    editable={!loginSubmitting}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    blurOnSubmit={false}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    ref={passwordInputRef}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    textContentType="password"
                    placeholder="********"
                    placeholderTextColor={placeholderColor}
                    style={styles.input}
                    editable={!loginSubmitting}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.rememberRow,
                    pressed && styles.rememberRowPressed,
                  ]}
                  onPress={() => setRememberDevice((prev) => !prev)}
                >
                  <View style={[styles.checkbox, rememberDevice && styles.checkboxChecked]}>
                    {rememberDevice ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <View>
                    <Text style={styles.rememberLabel}>Keep me logged in on this device</Text>
                    <Text style={styles.rememberHint}>Leave unchecked to sign out automatically.</Text>
                  </View>
                </Pressable>
                {loginError ? <Text style={styles.error}>{loginError}</Text> : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                    loginSubmitting && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loginSubmitting}
                >
                  {loginSubmitting ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign in</Text>
                  )}
                </Pressable>
              </>
            )}
            <Text style={styles.legalNotice}>
              By continuing you agree to the{' '}
              <Text style={styles.legalLink} onPress={() => void openTermsOfUse()}>
                Terms of Use
              </Text>{' '}
              and{' '}
              <Text style={styles.legalLink} onPress={() => void openPrivacyPolicy()}>
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingVertical: 32,
      paddingBottom: 200,
      gap: 24,
      justifyContent: 'flex-start',
    },
    containerWeb: {
      alignItems: 'center',
      paddingBottom: 64,
    },
    formSurface: {
      width: '100%',
      gap: 16,
    },
    formSurfaceWeb: {
      maxWidth: 520,
      backgroundColor: colors.surface,
      borderRadius: 32,
      padding: 32,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.overlay,
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '600',
      textAlign: 'center',
    },
    accessNote: {
      color: colors.mutedText,
      textAlign: 'center',
      lineHeight: 20,
    },
    modeSwitch: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
      borderRadius: 999,
      padding: 4,
      gap: 4,
    },
    modeButton: {
      flex: 1,
      borderRadius: 999,
      paddingVertical: 10,
      alignItems: 'center',
    },
    modeButtonActive: {
      backgroundColor: colors.primary,
    },
    modeButtonPressed: {
      opacity: 0.85,
    },
    modeButtonLabel: {
      color: colors.mutedText,
      fontWeight: '600',
    },
    modeButtonLabelActive: {
      color: colors.surface,
    },
    fieldGroup: {
      gap: 8,
    },
    label: {
      color: colors.text,
      fontSize: 14,
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      color: colors.text,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
    },
    error: {
      color: colors.danger,
      textAlign: 'center',
    },
    helperText: {
      color: colors.mutedText,
      fontSize: 12,
      textAlign: 'center',
    },
    rememberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    rememberRowPressed: {
      opacity: 0.85,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkboxMark: {
      color: isDark ? colors.surface : '#0f172a',
      fontWeight: '700',
      fontSize: 12,
    },
    rememberLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    rememberHint: {
      color: colors.mutedText,
      fontSize: 11,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryButtonPressed: {
      opacity: 0.9,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: colors.surface,
      fontSize: 16,
      fontWeight: '600',
    },
    legalNotice: {
      color: colors.mutedText,
      fontSize: 12,
      textAlign: 'center',
    },
    legalLink: {
      color: colors.primary,
      textDecorationLine: 'underline',
      fontWeight: '600',
    },
  });
}
