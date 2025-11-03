import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { API_BASE } from './api';
import { Stop } from './types';

type PinsFormProps = {
  onPinsChange: (pins: Stop[]) => void;
  onLoadingChange?: (loading: boolean) => void;
};

type FormState =
  | { type: 'idle' }
  | { type: 'error'; message: string }
  | { type: 'success'; count: number };

export function PinsForm({ onPinsChange, onLoadingChange }: PinsFormProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<FormState>({ type: 'idle' });

  const handleGeocode = useCallback(async () => {
    const addresses = input
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (addresses.length === 0) {
      setState({ type: 'error', message: 'Enter at least one address.' });
      onPinsChange([]);
      return;
    }

    setLoading(true);
    onLoadingChange?.(true);
    setState({ type: 'idle' });

    try {
      const response = await fetch(`${API_BASE}/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses }),
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? `${payload.error}: ${payload.message ?? 'Request failed.'}`
            : `HTTP ${response.status}: ${text || 'Request failed'}`
        );
      }

      if (!payload || !Array.isArray(payload.pins)) {
        throw new Error('Unexpected response from geocode endpoint.');
      }

      const pins: Stop[] = payload.pins.map((pin: any, index: number) => ({
        id: String(pin?.id ?? index + 1),
        address: String(pin?.address ?? ''),
        lat: typeof pin?.lat === 'number' ? pin.lat : undefined,
        lng: typeof pin?.lng === 'number' ? pin.lng : undefined,
      }));

      setState({ type: 'success', count: pins.length });
      onPinsChange(pins);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to geocode addresses.';
      setState({ type: 'error', message });
      onPinsChange([]);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [input, onPinsChange, onLoadingChange]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Geocode Addresses</Text>
      <Text style={styles.instructions}>
        Paste newline-delimited addresses. The worker returns coordinates for each and the app will
        show them as pins.
      </Text>
      <TextInput
        multiline
        style={styles.input}
        placeholder={'123 Main St, City, ST\n456 Pine Ave, Town, ST'}
        value={input}
        onChangeText={setInput}
        editable={!loading}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Button title={loading ? 'Geocoding...' : 'Geocode'} disabled={loading} onPress={handleGeocode} />
      <View style={styles.resultContainer}>
        {loading && <ActivityIndicator />}
        {!loading && state.type === 'success' && (
          <Text style={styles.successText}>Loaded {state.count} pins.</Text>
        )}
        {!loading && state.type === 'error' && (
          <Text style={styles.errorText}>{state.message}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 48,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  instructions: {
    color: '#4b5563',
    marginBottom: 12,
  },
  input: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    backgroundColor: '#f9fafb',
    marginBottom: 16,
  },
  resultContainer: {
    marginTop: 16,
    minHeight: 24,
  },
  successText: {
    color: '#15803d',
    fontWeight: '600',
  },
  errorText: {
    color: '#b91c1c',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
});
