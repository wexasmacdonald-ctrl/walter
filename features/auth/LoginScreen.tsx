import { useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { ADMIN_LOGIN_HINT } from '@/constants/auth';
import { useAuth } from './auth-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { openPrivacyPolicy, openTermsOfUse } from '@/features/legal/legal-documents';
import { AppHeader } from '@/components/AppHeader';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identifierInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn(identifier.trim(), password);
      setPassword('');
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't sign you in. Check your email or password and try again.",
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <AppHeader />
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
        <Text style={styles.title}>Sign in to continue</Text>
        <Text style={styles.accessNote}>To use this app please message an admin at walterhagen@bell.net.</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Admin access</Text>
          <Text style={styles.noticeBody}>{ADMIN_LOGIN_HINT}</Text>
        </View>
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
            style={styles.input}
            editable={!submitting}
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
            placeholder="••••••••"
            style={styles.input}
            editable={!submitting}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>Sign in</Text>
          )}
        </Pressable>
        <Text style={styles.legalNotice}>
          By signing in you agree to the{' '}
          <Text style={styles.legalLink} onPress={() => void openTermsOfUse()}>
            Terms of Use
          </Text>{' '}
          and{' '}
          <Text style={styles.legalLink} onPress={() => void openPrivacyPolicy()}>
            Privacy Policy
          </Text>
          .
        </Text>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 64,
    gap: 24,
    justifyContent: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  accessNote: {
    color: '#cbd5f5',
    textAlign: 'center',
    lineHeight: 20,
  },
  notice: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  noticeTitle: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  noticeBody: {
    color: '#e2e8f0',
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#cbd5f5',
    fontSize: 14,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    color: '#f87171',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  legalNotice: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
  legalLink: {
    color: '#bfdbfe',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
