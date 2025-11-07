import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from './auth-context';
import type { UserRole } from './types';

export function AdminCreateUserCard() {
  const { createUser } = useAuth();
  const [fullName, setFullName] = useState('');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [role, setRole] = useState<UserRole>('driver');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const resetForm = () => {
    setFullName('');
    setEmailOrPhone('');
    setRole('driver');
  };

  const handleSubmit = async () => {
    if (loading) {
      return;
    }
    setError(null);
    setTempPassword(null);
    setLoading(true);
    try {
      const result = await createUser({
        fullName: fullName.trim(),
        emailOrPhone: emailOrPhone.trim(),
        role,
      });
      setTempPassword(result.tempPassword);
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user.';
      setError(message);
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
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Ada Lovelace"
          style={styles.input}
          editable={!loading}
        />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Email or phone</Text>
        <TextInput
          value={emailOrPhone}
          onChangeText={setEmailOrPhone}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="driver@example.com"
          style={styles.input}
          editable={!loading}
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
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>Create account</Text>
        )}
      </Pressable>
      {tempPassword ? (
        <View style={styles.result}>
          <Text style={styles.resultLabel}>Temporary password</Text>
          <Text style={styles.resultValue}>{tempPassword}</Text>
          <Text style={styles.resultHint}>Share this password with the employee. They can change it after signing in.</Text>
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

function RoleButton({ label, selected, onPress }: RoleButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.roleButton, selected && styles.roleButtonSelected, pressed && styles.roleButtonPressed]}
      onPress={onPress}
    >
      <Text style={[styles.roleButtonLabel, selected && styles.roleButtonLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  subtitle: {
    color: '#475569',
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontWeight: '600',
    color: '#1e293b',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
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
    borderColor: '#cbd5f5',
    paddingVertical: 10,
    alignItems: 'center',
  },
  roleButtonSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  roleButtonPressed: {
    opacity: 0.9,
  },
  roleButtonLabel: {
    color: '#1e293b',
    fontWeight: '600',
  },
  roleButtonLabelSelected: {
    color: '#fff',
  },
  error: {
    color: '#dc2626',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  result: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    padding: 14,
    gap: 6,
  },
  resultLabel: {
    fontWeight: '600',
    color: '#1d4ed8',
  },
  resultValue: {
    fontFamily: 'monospace',
    fontSize: 18,
    color: '#1e293b',
  },
  resultHint: {
    color: '#1e40af',
    fontSize: 12,
  },
});
