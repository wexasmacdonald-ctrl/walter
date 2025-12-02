import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';
import { API_BASE } from './api';
import { Stop } from './types';
import { useTheme } from '@/features/theme/theme-context';

type PinsFormProps = {
  pins: Stop[];
  onPinsChange: (pins: Stop[]) => void;
  onLoadingChange?: (loading: boolean) => void;
};

type FormState =
  | { type: 'idle' }
  | { type: 'error'; message: string }
  | { type: 'success'; count: number };

function extractHouseNumber(address: string): string | null {
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}

type ParsedAddresses = {
  uniqueLines: string[];
  duplicates: Array<{ value: string; count: number }>;
};

function parseAddressInput(value: string): ParsedAddresses {
  const lines = value.split('\n');
  const seen = new Map<string, { canonical: string; count: number }>();
  const uniqueLines: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    const entry = seen.get(key);
    if (!entry) {
      seen.set(key, { canonical: trimmed, count: 1 });
      uniqueLines.push(trimmed);
    } else {
      entry.count += 1;
    }
  });

  const duplicates = Array.from(seen.values())
    .filter((entry) => entry.count > 1)
    .map((entry) => ({ value: entry.canonical, count: entry.count }));

  return { uniqueLines, duplicates };
}

type ParsedAddresses = {
  uniqueLines: string[];
  duplicates: Array<{ value: string; count: number }>;
};

function parseAddressInput(value: string): ParsedAddresses {
  const lines = value.split('\n');
  const seen = new Map<string, { canonical: string; count: number }>();
  const uniqueLines: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    const entry = seen.get(key);
    if (!entry) {
      seen.set(key, { canonical: trimmed, count: 1 });
      uniqueLines.push(trimmed);
    } else {
      entry.count += 1;
    }
  });

  const duplicates = Array.from(seen.values())
    .filter((entry) => entry.count > 1)
    .map((entry) => ({ value: entry.canonical, count: entry.count }));

  return { uniqueLines, duplicates };
}

export function PinsForm({ pins, onPinsChange, onLoadingChange }: PinsFormProps) {
  const { token, signOut, user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const placeholderColor = colors.mutedText;
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<FormState>({ type: 'idle' });
  const parsedAddresses = useMemo(() => parseAddressInput(input), [input]);
  const hasDuplicates = parsedAddresses.duplicates.length > 0;

  const [showInput, setShowInput] = useState(true);
  const [showList, setShowList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState('');
  const isBusinessTier = user?.businessTier === 'business';
  const planSummary = isBusinessTier
    ? user?.businessName
      ? `${user.businessName} · Business tier (unlimited)`
      : 'Business tier · Unlimited stops'
    : 'Free tier · 30 new stops every 24 hours · Use Settings to unlock the business tier.';

  useEffect(() => {
    setSelected((prev) => {
      const allowed = new Set(pins.map((pin) => pin.id));
      const next: Record<string, boolean> = {};
      let changed = false;
      Object.entries(prev).forEach(([key, value]) => {
        if (value && allowed.has(key)) {
          next[key] = true;
        } else if (value) {
          changed = true;
        }
      });
      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      return next;
    });
  }, [pins]);

  useEffect(() => {
    if (activeId && !pins.some((pin) => pin.id === activeId)) {
      setActiveId(null);
      setIsEditing(false);
      setEditingValue('');
    }
  }, [activeId, pins]);

  useEffect(() => {
    if (pins.length === 0) {
      setShowList(false);
      setActiveId(null);
      setIsEditing(false);
      setEditingValue('');
      setSelected({});
      setShowInput(true);
    }
  }, [pins.length]);

  const filteredPins = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return pins;
    }
    return pins.filter((pin) => {
      const address = pin.address?.toLowerCase() ?? '';
      const label = pin.label?.toLowerCase() ?? '';
      return address.includes(query) || label.includes(query);
    });
  }, [pins, searchQuery]);

  const selectedIds = useMemo(() => {
    const validIds = new Set(pins.map((pin) => pin.id));
    return Object.entries(selected)
      .filter(([id, value]) => value && validIds.has(id))
      .map(([id]) => id);
  }, [pins, selected]);

  const hasSelection = selectedIds.length > 0;

  const toggleSelection = (id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return next;
    });
  };

  const handleRowPress = (id: string) => {
    setActiveId((prev) => {
      if (prev === id) {
        setIsEditing(false);
        setEditingValue('');
        return null;
      }
      setIsEditing(false);
      setEditingValue('');
      return id;
    });
  };

  const handleStartEditing = (id: string, address: string | undefined) => {
    setActiveId(id);
    setEditingValue(address ?? '');
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditingValue('');
  };

  const handleSaveEditing = () => {
    if (!activeId) {
      return;
    }
    const trimmed = (editingValue ?? '').trim();
    if (!trimmed) {
      return;
    }

    const updated = pins.map((pin) => {
      if (pin.id !== activeId) {
        return pin;
      }
      const label = extractHouseNumber(trimmed) ?? pin.label;
      return {
        ...pin,
        address: trimmed,
        label: label ?? undefined,
      };
    });

    onPinsChange(updated);
    setIsEditing(false);
    setEditingValue('');
  };

  const handleDeletePin = (id: string) => {
    const nextPins = pins.filter((pin) => pin.id !== id);
    onPinsChange(nextPins);
    setSelected((prev) => {
      if (!prev[id]) {
        return prev;
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeId === id) {
      setActiveId(null);
      setIsEditing(false);
      setEditingValue('');
    }
  };

  const handleDeleteSelected = () => {
    if (!hasSelection) {
      return;
    }
    const selectedSet = new Set(selectedIds);
    const nextPins = pins.filter((pin) => !selectedSet.has(pin.id));
    onPinsChange(nextPins);
    setSelected({});
    if (activeId && selectedSet.has(activeId)) {
      setActiveId(null);
      setIsEditing(false);
      setEditingValue('');
    }
  };

  const handleClearSelection = () => {
    setSelected({});
  };

  const handleRemoveDuplicates = () => {
    if (!hasDuplicates) {
      return;
    }
    setInput(parsedAddresses.uniqueLines.join('\n'));
    if (state.type === 'error') {
      setState({ type: 'idle' });
    }
  };

  const handleGeocode = useCallback(async () => {
    if (!token) {
      setState({
        type: 'error',
        message: 'Session expired. Please sign in again.',
      });
      onPinsChange([]);
      return;
    }

    const addresses = parsedAddresses.uniqueLines;

    if (addresses.length === 0) {
      setState({ type: 'error', message: 'Enter at least one address.' });
      onPinsChange([]);
      return;
    }

    setLoading(true);
    onLoadingChange?.(true);
    setState({ type: 'idle' });

    const normalized = addresses.map((address) => {
      const match = address.trim().match(/^(\d+)[\-�?"](\d+)(.*)$/);
      if (!match) {
        return address;
      }
      const [, first, , rest = ''] = match;
      return `${first}${rest}`;
    });

    try {
      const response = await fetch(`${API_BASE}/geocode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ addresses: normalized }),
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setTimeout(() => {
            void signOut();
          }, 0);
          throw new Error('Session expired. Please sign in again.');
        }
        if (payload?.error === 'FREE_TIER_LIMIT_REACHED') {
          const resetDate =
            typeof payload?.resetsAt === 'string' ? new Date(payload.resetsAt) : null;
          const resetLabel =
            resetDate && !Number.isNaN(resetDate.getTime())
              ? resetDate.toLocaleTimeString()
              : null;
          const friendly = resetLabel
            ? `Daily limit reached on the free plan. Try again after ${resetLabel} or enter a workspace invite code in Settings to unlock unlimited usage.`
            : 'Daily limit reached on the free plan. Enter a workspace invite code in Settings to unlock unlimited usage.';
          throw new Error(friendly);
        }
        throw new Error(
          typeof payload?.error === 'string'
            ? `${payload.error}: ${payload.message ?? 'Request failed.'}`
            : `HTTP ${response.status}: ${text || 'Request failed'}`
        );
      }

      if (!payload || !Array.isArray(payload.pins)) {
        throw new Error('Unexpected response from geocode endpoint.');
      }

      const houseNumbers = normalized.map((address) => extractHouseNumber(address));
      const nextPins: Stop[] = payload.pins.map((pin: any, index: number) => ({
        id: String(pin?.id ?? index + 1),
        address: String(pin?.address ?? ''),
        lat: typeof pin?.lat === 'number' ? pin.lat : undefined,
        lng: typeof pin?.lng === 'number' ? pin.lng : undefined,
        label:
          typeof pin?.label === 'string' && pin.label.trim()
            ? pin.label.trim()
            : houseNumbers[index] ?? undefined,
        status: 'pending',
      }));

      setState({ type: 'success', count: nextPins.length });
      onPinsChange(nextPins);
      setInput('');
      setShowList(false);
      setShowInput(false);
      setSelected({});
      setActiveId(null);
      setIsEditing(false);
      setEditingValue('');
    } catch (error) {
      setState({
        type: 'error',
        message: getFriendlyError(error, {
          fallback: "We couldn't load those addresses. Try again.",
        }),
      });
      onPinsChange([]);
      setShowList(false);
      setShowInput(true);
      setSelected({});
      setActiveId(null);
      setIsEditing(false);
      setEditingValue('');
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [parsedAddresses, onPinsChange, onLoadingChange, token, signOut]);

  const handleStartInput = useCallback(() => {
    setShowInput(true);
    setInput('');
    setState({ type: 'idle' });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Load Addresses Onto The Map</Text>
      <View style={styles.planBanner}>
        <Text style={styles.planBannerText}>{planSummary}</Text>
      </View>
      {showInput ? (
        <>
          <Text style={styles.instructions}>
            Paste each address on its own line and we&apos;ll drop a pin for every match.
          </Text>
          <TextInput
            multiline
            style={styles.input}
            placeholder="Paste addresses here"
            value={input}
            onChangeText={setInput}
            editable={!loading}
            autoCorrect={false}
            autoCapitalize="none"
            placeholderTextColor={placeholderColor}
          />
          {hasDuplicates ? (
            <View style={styles.duplicateBanner}>
              <Text style={styles.duplicateTitle}>Duplicate addresses detected</Text>
              {parsedAddresses.duplicates.map((dup) => (
                <Text key={dup.value} style={styles.duplicateEntry}>
                  {dup.value}
                  {dup.count > 1 ? ` (x${dup.count})` : ''}
                </Text>
              ))}
              <Text style={styles.duplicateHint}>Duplicates are ignored when geocoding.</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.duplicateButton,
                  pressed && styles.duplicateButtonPressed,
                ]}
                onPress={handleRemoveDuplicates}
              >
                <Text style={styles.duplicateButtonText}>Remove duplicates</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={handleGeocode}
            disabled={loading}
            style={({ pressed }) => [
              styles.geocodeButton,
              loading && styles.geocodeButtonDisabled,
              pressed && !loading && styles.geocodeButtonPressed,
            ]}
          >
            {loading ? (
              <View style={styles.geocodeButtonContent}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.geocodeButtonText, styles.geocodeButtonTextDisabled]}>Loading pins...</Text>
              </View>
            ) : (
              <Text style={styles.geocodeButtonText}>Load Addresses</Text>
            )}
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={handleStartInput}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
        >
          <Text style={styles.addButtonText}>Add more addresses</Text>
        </Pressable>
      )}
      <View style={styles.resultContainer}>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && state.type === 'success' && (
          <Text style={styles.successText}>Loaded {state.count} pins.</Text>
        )}
        {!loading && state.type === 'error' && (
          <Text style={styles.errorText}>{state.message}</Text>
        )}
      </View>

      {pins.length > 0 && (
        <View style={styles.listContainer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowList((prev) => !prev)}
            style={({ pressed }) => [
              styles.listToggle,
              pressed && styles.listTogglePressed,
            ]}
          >
            <Text style={styles.listToggleText}>
              {showList
                ? 'Hide loaded addresses'
                : `Show ${pins.length} loaded address${pins.length === 1 ? '' : 'es'}`}
            </Text>
          </Pressable>

          {showList && (
            <View style={styles.listContent}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search addresses"
                placeholderTextColor={placeholderColor}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <View style={styles.bulkActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleDeleteSelected}
                  disabled={!hasSelection}
                  style={({ pressed }) => [
                    styles.bulkButton,
                    styles.bulkButtonDanger,
                    !hasSelection && styles.bulkButtonDisabled,
                    pressed && hasSelection && styles.bulkButtonPressed,
                  ]}
                >
                  <Text style={styles.bulkButtonDangerText}>Delete selected</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleClearSelection}
                  disabled={!hasSelection}
                  style={({ pressed }) => [
                    styles.bulkButton,
                    styles.bulkButtonSecondary,
                    !hasSelection && styles.bulkButtonDisabled,
                    pressed && hasSelection && styles.bulkButtonPressed,
                  ]}
                >
                  <Text style={styles.bulkButtonSecondaryText}>Clear selection</Text>
                </Pressable>
              </View>

              <View style={styles.addressList}>
                {filteredPins.length === 0 ? (
                  <View style={styles.addressEmpty}>
                    <Text style={styles.addressEmptyText}>No addresses match your search.</Text>
                  </View>
                ) : (
                  filteredPins.map((pin) => {
                    const isSelected = Boolean(selected[pin.id]);
                    const isActive = activeId === pin.id;

                    return (
                      <View
                        key={pin.id}
                        style={[
                          styles.addressRow,
                          isSelected && styles.addressRowSelected,
                          isActive && styles.addressRowActive,
                        ]}
                      >
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => toggleSelection(pin.id)}
                          style={({ pressed }) => [
                            styles.addressSelect,
                            isSelected && styles.addressSelectActive,
                            pressed && styles.addressSelectPressed,
                          ]}
                        >
                          <Text style={styles.addressSelectText}>{isSelected ? '✓' : ''}</Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleRowPress(pin.id)}
                          style={styles.addressBody}
                        >
                          <Text style={styles.addressLine}>{pin.address || 'Address unavailable'}</Text>
                        </Pressable>

                        {isActive && !isEditing && (
                          <View style={styles.inlineActions}>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => handleStartEditing(pin.id, pin.address)}
                              style={({ pressed }) => [
                                styles.addressActionButton,
                                styles.addressActionSecondary,
                                pressed && styles.addressActionPressed,
                              ]}
                            >
                              <Text style={styles.addressActionSecondaryText}>Edit</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => handleDeletePin(pin.id)}
                              style={({ pressed }) => [
                                styles.addressActionButton,
                                styles.addressActionDanger,
                                pressed && styles.addressActionPressed,
                              ]}
                            >
                              <Text style={styles.addressActionDangerText}>Delete</Text>
                            </Pressable>
                          </View>
                        )}

                        {isActive && isEditing && (
                          <View style={styles.editBlock}>
                            <TextInput
                              value={editingValue}
                              onChangeText={setEditingValue}
                              placeholder="Edit address"
                              placeholderTextColor={placeholderColor}
                              style={styles.addressEditInput}
                              autoFocus
                            />
                            <View style={styles.inlineActions}>
                              <Pressable
                                accessibilityRole="button"
                                onPress={handleSaveEditing}
                                disabled={(editingValue ?? '').trim().length === 0}
                                style={({ pressed }) => [
                                  styles.addressActionButton,
                                  styles.addressActionPrimary,
                                  (editingValue ?? '').trim().length === 0 && styles.addressActionDisabled,
                                  pressed &&
                                    (editingValue ?? '').trim().length > 0 &&
                                    styles.addressActionPressed,
                                ]}
                              >
                                <Text style={styles.addressActionPrimaryText}>Save</Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                onPress={handleCancelEditing}
                                style={({ pressed }) => [
                                  styles.addressActionButton,
                                  styles.addressActionSecondary,
                                  pressed && styles.addressActionPressed,
                                ]}
                              >
                                <Text style={styles.addressActionSecondaryText}>Cancel</Text>
                              </Pressable>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const onPrimary = isDark ? colors.background : colors.surface;
  return StyleSheet.create({
    container: {
      marginBottom: 48,
    },
    heading: {
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 12,
      color: colors.text,
    },
    planBanner: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    planBannerText: {
      color: colors.primary,
      fontWeight: '600',
      textAlign: 'center',
    },
    instructions: {
      color: colors.mutedText,
      marginBottom: 12,
    },
    geocodeButton: {
      marginTop: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    geocodeButtonPressed: {
      opacity: 0.92,
    },
    geocodeButtonDisabled: {
      backgroundColor: colors.primaryMuted,
    },
    geocodeButtonText: {
      color: onPrimary,
      fontWeight: '600',
    },
    geocodeButtonTextDisabled: {
      color: colors.primary,
    },
    geocodeButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    addButton: {
      marginBottom: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonPressed: {
      opacity: 0.9,
    },
    addButtonText: {
      color: colors.primary,
      fontWeight: '600',
    },
    input: {
      minHeight: 160,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
      marginBottom: 16,
    },
    duplicateBanner: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? '#1a2a3d' : colors.primaryMuted,
      padding: 12,
      gap: 6,
      marginBottom: 8,
    },
    duplicateTitle: {
      color: colors.primary,
      fontWeight: '600',
    },
    duplicateEntry: {
      color: colors.text,
      fontSize: 13,
    },
    duplicateHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    duplicateButton: {
      marginTop: 4,
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 6,
      paddingHorizontal: 14,
      backgroundColor: colors.primary,
    },
    duplicateButtonPressed: {
      opacity: 0.9,
    },
    duplicateButtonText: {
      color: onPrimary,
      fontWeight: '600',
    },
    resultContainer: {
      marginTop: 16,
      minHeight: 24,
    },
    successText: {
      color: colors.success,
      fontWeight: '600',
    },
    errorText: {
      color: colors.danger,
      fontWeight: '600',
    },
    listContainer: {
      marginTop: 24,
      gap: 16,
    },
    listToggle: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    listTogglePressed: {
      opacity: 0.9,
    },
    listToggleText: {
      color: onPrimary,
      fontWeight: '600',
    },
    listContent: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
      backgroundColor: colors.surface,
      gap: 16,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    bulkActions: {
      flexDirection: 'row',
      gap: 12,
    },
    bulkButton: {
      flex: 1,
      borderRadius: 999,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    bulkButtonPressed: {
      opacity: 0.9,
    },
    bulkButtonDisabled: {
      opacity: 0.6,
    },
    bulkButtonDanger: {
      backgroundColor: colors.dangerMuted,
      borderColor: colors.danger,
    },
    bulkButtonDangerText: {
      color: colors.danger,
      fontWeight: '600',
    },
    bulkButtonSecondary: {
      backgroundColor: colors.primaryMuted,
      borderColor: colors.primary,
    },
    bulkButtonSecondaryText: {
      color: colors.primary,
      fontWeight: '600',
    },
    addressList: {
      gap: 12,
    },
    addressEmpty: {
      paddingVertical: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addressEmptyText: {
      color: colors.mutedText,
      textAlign: 'center',
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    addressRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
    },
    addressRowActive: {
      borderColor: colors.success,
      backgroundColor: colors.successMuted,
    },
    addressSelect: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    addressSelectActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    addressSelectPressed: {
      opacity: 0.9,
    },
    addressSelectText: {
      color: onPrimary,
      fontWeight: '700',
    },
    addressBody: {
      flex: 1,
      gap: 4,
    },
    addressLine: {
      color: colors.text,
      fontWeight: '600',
    },
    inlineActions: {
      flexDirection: 'row',
      gap: 8,
    },
    editBlock: {
      flex: 1,
      gap: 12,
    },
    addressActionButton: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    addressActionPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    addressActionPrimaryText: {
      color: onPrimary,
      fontWeight: '600',
    },
    addressActionSecondary: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    addressActionSecondaryText: {
      color: colors.text,
      fontWeight: '600',
    },
    addressActionDanger: {
      backgroundColor: colors.dangerMuted,
      borderColor: colors.danger,
    },
    addressActionDangerText: {
      color: colors.danger,
      fontWeight: '600',
    },
    addressActionDisabled: {
      opacity: 0.5,
    },
    addressActionPressed: {
      opacity: 0.85,
    },
    addressEditInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
  });
}
