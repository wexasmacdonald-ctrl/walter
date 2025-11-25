import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { DriverStop, DriverSummary } from '@/features/auth/types';
import type { Stop } from '@/features/route-planner/types';
import { MapScreen } from '@/features/route-planner/MapScreen';
import { StopLocationEditor } from '@/features/admin/components/StopLocationEditor';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

const MAX_ADDRESSES = 150;
const DEFAULT_COORDINATE = { latitude: 44.9778, longitude: -93.265 };

type PinEditorState = {
  stop: DriverStop;
  coordinate: { latitude: number; longitude: number };
};

type AdminDriverDetailProps = {
  driverId: string;
  onClose: () => void;
  refreshSignal?: number;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
};

export function AdminDriverDetail({
  driverId,
  onClose,
  refreshSignal,
  refreshing = false,
  onRefresh,
}: AdminDriverDetailProps) {
  const {
    token,
    workspaceId,
    resetUserPassword,
    deleteUserAccount,
    adminUpdateUserProfile,
    adminUpdateUserPassword,
  } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [driver, setDriver] = useState<DriverSummary | null>(null);
  const [stops, setStops] = useState<DriverStop[]>([]);
  const [loadingDriver, setLoadingDriver] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showStopsList, setShowStopsList] = useState(false);
  const [addText, setAddText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [pinEditor, setPinEditor] = useState<PinEditorState | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [forgettingCache, setForgettingCache] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountContact, setAccountContact] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [addStopsExpanded, setAddStopsExpanded] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const accountNameInputRef = useRef<TextInput | null>(null);
  const accountContactInputRef = useRef<TextInput | null>(null);
  const driverPasswordInputRef = useRef<TextInput | null>(null);
  const driverPasswordConfirmInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!token || !workspaceId) {
      return;
    }
    async function loadDriver() {
      try {
        setLoadingDriver(true);
        const drivers = await authApi.fetchDrivers(token, workspaceId);
        setDriver(drivers.find((entry) => entry.id === driverId) ?? null);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't load that driver right now. Try again shortly.",
        })
      );
    } finally {
      setLoadingDriver(false);
    }
    }
    loadDriver();
  }, [token, workspaceId, driverId, refreshSignal]);

  useEffect(() => {
    setShowStopsList(false);
    setAddText('');
    setSearchQuery('');
    setSelectedIds({});
    setEditingId(null);
    setEditingValue('');
    setActiveStopId(null);
    setAccountExpanded(false);
    setAddStopsExpanded(false);
    setMapExpanded(false);
  }, [driverId]);

  useEffect(() => {
    if (driver) {
      setAccountName(driver.fullName ?? '');
      setAccountContact(driver.emailOrPhone ?? '');
    } else {
      setAccountName('');
      setAccountContact('');
    }
    setAccountError(null);
    setNewPasswordValue('');
    setConfirmPasswordValue('');
    setPasswordError(null);
  }, [driver?.id]);

  useEffect(() => {
    if (!token || !workspaceId) {
      return;
    }
    async function loadStops() {
      try {
        setLoadingStops(true);
        const result = await authApi.fetchDriverStops(token, driverId, workspaceId);
        setStops(result);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't load the latest stops. Pull to refresh and try again.",
        })
      );
    } finally {
      setLoadingStops(false);
    }
    }
    loadStops();
  }, [token, workspaceId, driverId, refreshSignal]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const allowed = new Set(stops.map((stop) => stop.id));
      const next: Record<string, boolean> = {};
      let changed = false;
      Object.entries(prev).forEach(([id, active]) => {
        if (active && allowed.has(id)) {
          next[id] = true;
        } else if (active) {
          changed = true;
        }
      });
      const prevActive = Object.values(prev).filter(Boolean).length;
      const nextActive = Object.keys(next).length;
      if (!changed && prevActive === nextActive) {
        return prev;
      }
      return next;
    });
  }, [stops]);

  useEffect(() => {
    if (editingId && !stops.some((stop) => stop.id === editingId)) {
      setEditingId(null);
      setEditingValue('');
    }
  }, [editingId, stops]);

  useEffect(() => {
    if (activeStopId && !stops.some((stop) => stop.id === activeStopId)) {
      setActiveStopId(null);
    }
  }, [activeStopId, stops]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredStops = useMemo(() => {
    if (!normalizedQuery) {
      return stops;
    }
    return stops.filter((stop) =>
      (stop.address ?? '').toLowerCase().includes(normalizedQuery)
    );
  }, [stops, normalizedQuery]);

  const shouldShowAddresses = showStopsList || normalizedQuery.length > 0;
  const visibleStops = shouldShowAddresses ? filteredStops : [];
  const selectionCount = useMemo(
    () => Object.values(selectedIds).filter(Boolean).length,
    [selectedIds]
  );
  const mapPins = useMemo<Stop[]>(() => {
    return stops.map((stop) => ({
      id: stop.id,
      address: stop.address,
      lat: stop.lat ?? undefined,
      lng: stop.lng ?? undefined,
      sortOrder: stop.sortOrder ?? undefined,
      status: stop.status,
      label: getHouseNumber(stop.address) ?? undefined,
    }));
  }, [stops]);

  const persistStops = async (nextAddresses: string[], successMessage: string) => {
    if (!token) {
      return;
    }
    const sanitized = nextAddresses
      .map((address) => (address ?? '').trim())
      .filter((address) => address.length > 0);
    if (sanitized.length > MAX_ADDRESSES) {
      setError(`You can load up to ${MAX_ADDRESSES} addresses at once.`);
      setSuccess(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await authApi.saveDriverStops(token, driverId, sanitized);
      setStops(updated);
      setSuccess(successMessage);
      setShowStopsList(true);
      setSelectedIds({});
      setActiveStopId(null);
      setEditingId(null);
      setEditingValue('');
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't save those stops. Try again in a moment.",
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddStops = async () => {
    if (saving) {
      return;
    }
    setError(null);
    setSuccess(null);
    const trimmed = addText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (trimmed.length === 0) {
      setError('Enter at least one address.');
      setSuccess(null);
      return;
    }
    if (stops.length + trimmed.length > MAX_ADDRESSES) {
      setError(`You can load up to ${MAX_ADDRESSES} addresses at once.`);
      setSuccess(null);
      return;
    }

    Keyboard.dismiss();
    await persistStops(
      [...stops.map((stop) => stop.address), ...trimmed],
      `Added ${trimmed.length} stop${trimmed.length === 1 ? '' : 's'}.`
    );
    setAddText('');
  };

  const confirmDeleteAllStops = () => {
    if (saving || stops.length === 0) {
      return;
    }
    Alert.alert(
      'Delete all stops?',
      'This will remove every address for this driver.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await persistStops([], 'Removed all stops.');
              setShowStopsList(false);
            })();
          },
        },
      ]
    );
  };

  const handleDeleteStop = (stopId: string) => {
    if (saving) {
      return;
    }
    Alert.alert(
      'Remove stop?',
      'This address will be removed from the driver list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const nextAddresses = stops
              .filter((stop) => stop.id !== stopId)
              .map((stop) => stop.address);
            void persistStops(nextAddresses, 'Stop removed.');
          },
        },
      ]
    );
  };

  const handleToggleSelect = (stopId: string) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[stopId]) {
        delete next[stopId];
      } else {
        next[stopId] = true;
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (saving) {
      return;
    }
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (ids.length === 0) {
      return;
    }
    Alert.alert(
      'Delete selected stops?',
      `This removes ${ids.length} stop${ids.length === 1 ? '' : 's'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const nextAddresses = stops
              .filter((stop) => !ids.includes(stop.id))
              .map((stop) => stop.address);
            void persistStops(nextAddresses, 'Selected stops deleted.');
          },
        },
      ]
    );
  };

  const handleStartEdit = (stop: DriverStop) => {
    setEditingId(stop.id);
    setEditingValue(stop.address);
    setShowStopsList(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const handleSubmitEdit = async () => {
    if (!editingId) {
      return;
    }
    const trimmed = editingValue.trim();
    if (!trimmed) {
      setError('Address cannot be empty.');
      setSuccess(null);
      return;
    }
    Keyboard.dismiss();
    await persistStops(
      stops.map((stop) => (stop.id === editingId ? trimmed : stop.address)),
      'Stop updated.'
    );
    setEditingId(null);
    setEditingValue('');
  };

  const handleStartLocationEdit = (stop: DriverStop) => {
    const latitude =
      typeof stop.lat === 'number' ? stop.lat : DEFAULT_COORDINATE.latitude;
    const longitude =
      typeof stop.lng === 'number' ? stop.lng : DEFAULT_COORDINATE.longitude;
    setActiveStopId(stop.id);
    setMapExpanded(true);
    if (Platform.OS !== 'web') {
      setPinEditor({
        stop,
        coordinate: { latitude, longitude },
      });
    }
  };

  const handleRequestPinAdjust = (stopId: string) => {
    const stop = stops.find((entry) => entry.id === stopId);
    if (stop) {
      handleStartLocationEdit(stop);
    }
  };

  const handleUpdatePinCoordinate = (coordinate: {
    latitude: number;
    longitude: number;
  }) => {
    setPinEditor((prev) => (prev ? { ...prev, coordinate } : prev));
  };

  const handleSavePinLocation = async () => {
    if (!pinEditor || !token) {
      return;
    }
    try {
      setUpdatingLocation(true);
      const updated = await authApi.updateDriverStopLocation(token, pinEditor.stop.id, {
        latitude: pinEditor.coordinate.latitude,
        longitude: pinEditor.coordinate.longitude,
      });
      setStops((prev) => prev.map((stop) => (stop.id === updated.id ? updated : stop)));
      setSuccess('Pin location updated.');
      setError(null);
      setPinEditor(null);
      setActiveStopId(pinEditor.stop.id);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't update that pin yet. Try again.",
        })
      );
    } finally {
      setUpdatingLocation(false);
    }
  };

  const handleSavePinLocationDirect = async (
    stopId: string,
    coordinate: { latitude: number; longitude: number }
  ) => {
    if (!token) {
      return;
    }
    try {
      setUpdatingLocation(true);
      const updated = await authApi.updateDriverStopLocation(token, stopId, coordinate);
      setStops((prev) => prev.map((stop) => (stop.id === updated.id ? updated : stop)));
      setSuccess('Pin location updated.');
      setError(null);
      setSelectedIds({});
      setActiveStopId(stopId);
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't update that pin yet. Try again.",
        })
      );
    } finally {
      setUpdatingLocation(false);
    }
  };

  const forgetAddresses = async (
    addresses: string[],
    successMessage: string,
    options: { clearSelection?: boolean } = {}
  ) => {
    if (!token) {
      return;
    }
    const unique = Array.from(
      new Set(
        addresses
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0)
      )
    );
    if (unique.length === 0) {
      setError('Select at least one address to forget.');
      setSuccess(null);
      return;
    }
    try {
      setForgettingCache(true);
      await authApi.forgetCachedAddresses(token, unique);
      setSuccess(successMessage);
      setError(null);
      if (options.clearSelection) {
        setSelectedIds({});
      }
    } catch (err) {
      setError(
        getFriendlyError(err, {
          fallback: "We couldn't clear those cached coordinates yet. Try again.",
        })
      );
    } finally {
      setForgettingCache(false);
    }
  };

  const handleForgetCacheForStop = (stop: DriverStop) => {
    void forgetAddresses(
      [stop.address],
      'Cached location removed for this stop.'
    );
  };

  const handleForgetSelectedCache = () => {
    if (forgettingCache) {
      return;
    }
    const addresses = stops
      .filter((stop) => selectedIds[stop.id])
      .map((stop) => stop.address);
    void forgetAddresses(
      addresses,
      `Removed ${addresses.length} cached location${addresses.length === 1 ? '' : 's'}.`,
      { clearSelection: true }
    );
  };

  const performResetDriverPassword = async () => {
    if (!driver) {
      return;
    }
    try {
      setResettingPassword(true);
      const result = await resetUserPassword(driver.id);
      const tempPassword = result.tempPassword;
      Alert.alert(
        'Temporary password generated',
        `Share this with ${driver.fullName || driver.emailOrPhone}:\n\n${tempPassword}`,
        [
          {
            text: 'Copy password',
            onPress: () => {
              void Clipboard.setStringAsync(tempPassword)
                .then(() => {
                  Alert.alert('Copied', 'Temporary password placed on your clipboard.');
                })
                .catch((copyError) => {
                  console.warn('Failed to copy temp password', copyError);
                  Alert.alert(
                    'Copy failed',
                    `Copy manually:\n\n${tempPassword}`
                  );
                });
            },
          },
          { text: 'Done', style: 'cancel' },
        ]
      );
    } catch (err) {
      const message = getFriendlyError(err, {
        fallback: "We couldn't reset their password. Try again.",
      });
      Alert.alert('Reset failed', message);
    } finally {
      setResettingPassword(false);
    }
  };

  const confirmResetDriverPassword = () => {
    if (!driver || resettingPassword) {
      return;
    }
    Alert.alert(
      'Reset password?',
      `Generate a temporary password for ${driver.fullName || driver.emailOrPhone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void performResetDriverPassword();
          },
        },
      ]
    );
  };

  const performDeleteDriverAccount = async () => {
    if (!driver) {
      return;
    }
    try {
      setDeletingAccount(true);
      await deleteUserAccount(driver.id);
      Alert.alert(
        'Driver removed',
        'The driver was removed from this company and returned to the free tier.'
      );
      if (onRefresh) {
        await Promise.resolve(onRefresh());
      }
      onClose();
    } catch (err) {
      const message = getFriendlyError(err, {
        fallback: "We couldn't remove that driver yet. Try again.",
      });
      Alert.alert('Remove failed', message);
    } finally {
      setDeletingAccount(false);
    }
  };

  const confirmDeleteDriverAccount = () => {
    if (!driver || deletingAccount) {
      return;
    }
    if (Platform.OS === 'web') {
      setDeleteConfirmVisible(true);
      return;
    }
    Alert.alert(
      'Delete account?',
      'This removes the account and anonymizes any remaining data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void performDeleteDriverAccount();
          },
        },
      ]
      );
  };

  const handleCancelDeleteDialog = () => {
    setDeleteConfirmVisible(false);
  };

  const handleConfirmDeleteDialog = () => {
    setDeleteConfirmVisible(false);
    void performDeleteDriverAccount();
  };

  const handleSaveAccountDetails = async () => {
    if (!driver || accountSaving) {
      return;
    }
    const trimmedContact = accountContact.trim();
    if (!trimmedContact) {
      setAccountError('Email or phone cannot be empty.');
      return;
    }
    const trimmedName = accountName.trim();
    setAccountError(null);
    setAccountSaving(true);
    try {
      const response = await adminUpdateUserProfile(driver.id, {
        fullName: trimmedName === '' ? null : trimmedName,
        emailOrPhone: trimmedContact,
      });
      const updatedUser = response.user;
      setDriver((prev) =>
        prev
          ? {
              ...prev,
              fullName: updatedUser.fullName,
              emailOrPhone: updatedUser.emailOrPhone ?? prev.emailOrPhone,
            }
          : prev
      );
      setAccountName(updatedUser.fullName ?? '');
      setAccountContact(updatedUser.emailOrPhone ?? '');
      Alert.alert('Profile updated', 'Account details saved.');
      if (onRefresh) {
        await Promise.resolve(onRefresh());
      }
    } catch (err) {
      setAccountError(
        getFriendlyError(err, {
          fallback: "We couldn't save those details. Try again.",
        })
      );
    } finally {
      setAccountSaving(false);
    }
  };

  const handlePromoteToAdmin = async () => {
    if (!driver || roleUpdating) {
      return;
    }
    setAccountError(null);
    setRoleUpdating(true);
    try {
      const currentEmailOrPhone = driver.emailOrPhone || accountContact.trim();
      const payload = {
        role: 'admin' as const,
        fullName: driver.fullName ?? (accountName.trim() || null),
        emailOrPhone: currentEmailOrPhone,
      };
      try {
        await adminUpdateUserProfile(driver.id, payload, workspaceId ?? undefined);
      } catch (error) {
        // Retry without workspace scoping in case the API requires a global context.
        await adminUpdateUserProfile(driver.id, payload, undefined);
      }
      Alert.alert('Role updated', 'This user is now an admin.');
      onRefresh?.();
      onClose();
    } catch (err) {
      setAccountError(
        getFriendlyError(err, {
          fallback: "We couldn't promote this user. Try again.",
        })
      );
    } finally {
      setRoleUpdating(false);
    }
  };

  const handleSaveDriverPassword = async () => {
    if (!driver || passwordSaving) {
      return;
    }
    if (!newPasswordValue || newPasswordValue.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPasswordValue !== confirmPasswordValue) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordError(null);
    setPasswordSaving(true);
    try {
      await adminUpdateUserPassword(driver.id, newPasswordValue);
      setNewPasswordValue('');
      setConfirmPasswordValue('');
      Alert.alert('Password updated', 'The driver must use this new password to sign in.');
    } catch (err) {
      setPasswordError(
        getFriendlyError(err, {
          fallback: "We couldn't change that password. Try again.",
        })
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            onPress={onClose}
          >
            <Text style={styles.backButtonText}>Back to drivers</Text>
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>Stop list</Text>
            {driver ? (
              <Text style={styles.subTitle} numberOfLines={1}>
                {driver.fullName || driver.emailOrPhone}
              </Text>
            ) : null}
          </View>
        </View>

      {loadingDriver ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator />
          <Text style={styles.loaderText}>Loading driver…</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {driver ? (
          <View style={styles.collapseSection}>
            <Pressable
              style={({ pressed }) => [
                styles.collapseToggle,
                pressed && styles.collapseTogglePressed,
              ]}
            onPress={() => setAccountExpanded((prev) => !prev)}
          >
            <Text style={styles.collapseToggleLabel}>
              {accountExpanded ? 'Hide account tools' : 'Edit account'}
            </Text>
          </Pressable>
          {accountExpanded ? (
            <View style={[styles.card, styles.accountSection]}>
              <View style={styles.accountForm}>
                <Text style={styles.accountLabel}>Full name</Text>
                  <TextInput
                    ref={accountNameInputRef}
                    style={styles.accountInput}
                    value={accountName}
                    onChangeText={setAccountName}
                    placeholder="Driver name"
                    placeholderTextColor={colors.mutedText}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => accountContactInputRef.current?.focus()}
                    blurOnSubmit={false}
                  />
                  <Text style={styles.accountLabel}>Email or phone</Text>
                  <TextInput
                    ref={accountContactInputRef}
                    style={styles.accountInput}
                    value={accountContact}
                    onChangeText={setAccountContact}
                    placeholder="driver@example.com"
                    placeholderTextColor={colors.mutedText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveAccountDetails}
                  />
                  {accountError ? <Text style={styles.error}>{accountError}</Text> : null}
                  <Pressable
                    style={({ pressed }) => [
                      styles.accountPrimaryButton,
                      pressed && !accountSaving && styles.accountButtonPressed,
                      accountSaving && styles.buttonDisabled,
                    ]}
                    onPress={handleSaveAccountDetails}
                    disabled={accountSaving}
                  >
                    {accountSaving ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.accountPrimaryButtonText}>Save account details</Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.accountForm}>
                  <Text style={styles.accountLabel}>Set new password</Text>
                  <TextInput
                    ref={driverPasswordInputRef}
                    style={styles.accountInput}
                    value={newPasswordValue}
                    onChangeText={setNewPasswordValue}
                    placeholder="New password"
                    placeholderTextColor={colors.mutedText}
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="next"
                    onSubmitEditing={() => driverPasswordConfirmInputRef.current?.focus()}
                    blurOnSubmit={false}
                  />
                  <TextInput
                    ref={driverPasswordConfirmInputRef}
                    style={styles.accountInput}
                    value={confirmPasswordValue}
                    onChangeText={setConfirmPasswordValue}
                    placeholder="Confirm new password"
                    placeholderTextColor={colors.mutedText}
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveDriverPassword}
                  />
                  {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
                  <Pressable
                    style={({ pressed }) => [
                      styles.accountPrimaryButton,
                      pressed && !passwordSaving && styles.accountButtonPressed,
                      passwordSaving && styles.buttonDisabled,
                    ]}
                    onPress={handleSaveDriverPassword}
                    disabled={passwordSaving}
                  >
                    {passwordSaving ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.accountPrimaryButtonText}>Update password</Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.accountActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.accountButton,
                      pressed && !resettingPassword && !deletingAccount && styles.accountButtonPressed,
                      (resettingPassword || deletingAccount) && styles.buttonDisabled,
                    ]}
                    onPress={confirmResetDriverPassword}
                    disabled={resettingPassword || deletingAccount}
                  >
                    {resettingPassword ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.accountButtonLabel}>Reset password</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.accountButton,
                      styles.accountButtonDanger,
                      pressed && !deletingAccount && !resettingPassword && styles.accountButtonPressed,
                      (deletingAccount || resettingPassword) && styles.buttonDisabled,
                    ]}
                    onPress={confirmDeleteDriverAccount}
                    disabled={deletingAccount || resettingPassword}
                  >
                    {deletingAccount ? (
                      <ActivityIndicator color={colors.danger} />
                    ) : (
                      <Text style={styles.accountButtonDangerLabel}>Delete account</Text>
                    )}
                  </Pressable>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.promoteButton,
                  pressed && styles.promoteButtonPressed,
                  roleUpdating && styles.promoteButtonDisabled,
                ]}
                onPress={handlePromoteToAdmin}
                disabled={roleUpdating}
              >
                {roleUpdating ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={[styles.promoteButtonText, { color: colors.surface }]}>
                    Promote to admin
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
        ) : null}

        <View style={styles.collapseSection}>
          <Pressable
            style={({ pressed }) => [
              styles.collapseToggle,
              pressed && styles.collapseTogglePressed,
            ]}
            onPress={() => setAddStopsExpanded((prev) => !prev)}
          >
            <Text style={styles.collapseToggleLabel}>
              {addStopsExpanded ? 'Hide edit stops' : 'Edit stops'}
            </Text>
          </Pressable>
          {addStopsExpanded ? (
            <View style={styles.card}>
              <Text style={styles.cardHeading}>Add stops</Text>
              <Text style={styles.cardHint}>
                Paste newline-separated addresses. Added stops appear in the driver list right away.
              </Text>
              <TextInput
                style={styles.textArea}
                multiline
                value={addText}
                onChangeText={setAddText}
                placeholder={'123 Main St, City, ST\n456 Pine Ave, Town, ST'}
                autoCorrect={false}
                autoCapitalize="none"
                editable={!saving}
                onFocus={() => setShowStopsList(false)}
              />
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                  onPress={handleAddStops}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={isDark ? colors.background : colors.surface} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Add stops</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.dangerButton,
                    (saving || stops.length === 0) && styles.buttonDisabled,
                    pressed && !(saving || stops.length === 0) && styles.dangerButtonPressed,
                  ]}
                  onPress={confirmDeleteAllStops}
                  disabled={saving || stops.length === 0}
                >
                  <Text style={styles.dangerButtonText}>Delete all stops</Text>
                </Pressable>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {success ? <Text style={styles.success}>{success}</Text> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.collapseSection}>
          <Pressable
            style={({ pressed }) => [
              styles.collapseToggle,
              pressed && styles.collapseTogglePressed,
            ]}
            onPress={() => setMapExpanded((prev) => !prev)}
          >
            <Text style={styles.collapseToggleLabel}>
              {mapExpanded ? 'Hide driver map' : 'Driver map'}
            </Text>
          </Pressable>
          {mapExpanded ? (
            <View style={styles.card}>
              <Text style={styles.cardHeading}>Driver map</Text>
              <Text style={styles.cardHint}>
                {mapPins.length
                  ? 'Hold Ctrl, drag a pin to the right spot, and release to save it in place.'
                  : 'Assign stops to see pins here.'}
              </Text>
              <MapScreen
                pins={mapPins}
                loading={loadingStops}
                onAdjustPin={Platform.OS !== 'web' ? handleRequestPinAdjust : undefined}
                onAdjustPinDrag={handleSavePinLocationDirect}
              />
              <Text style={styles.mapNote}>
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.searchHeader}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search addresses"
              value={searchQuery}
              onChangeText={(value) => {
                setSearchQuery(value);
                if (value.trim().length > 0) {
                  setShowStopsList(true);
                }
              }}
              placeholderTextColor={colors.mutedText}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <Pressable
              style={({ pressed }) => [styles.displayButton, pressed && styles.displayButtonPressed]}
              onPress={() => {
                Keyboard.dismiss();
                setShowStopsList(true);
              }}
            >
              <Text style={styles.displayButtonText}>Display addresses</Text>
            </Pressable>
          </View>

          {selectionCount > 0 ? (
            <View style={styles.selectionBar}>
              <Text style={styles.selectionText}>
                {selectionCount} selected
              </Text>
              <Pressable
                style={({ pressed }) => [styles.secondaryChip, pressed && styles.secondaryChipPressed]}
                onPress={handleForgetSelectedCache}
                disabled={forgettingCache}
              >
                <Text style={styles.secondaryChipText}>
                  {forgettingCache ? 'Clearing…' : 'Forget cache'}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dangerChip, pressed && styles.dangerChipPressed]}
                onPress={handleDeleteSelected}
                disabled={saving}
              >
                <Text style={styles.dangerChipText}>
                  {saving ? 'Deleting…' : 'Delete selected'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {loadingStops ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator />
              <Text style={styles.loaderText}>Syncing stops…</Text>
            </View>
          ) : null}

          {shouldShowAddresses ? (
            visibleStops.length === 0 ? (
              <Text style={styles.emptyText}>
                {normalizedQuery ? 'No addresses match your search.' : 'No addresses assigned yet.'}
              </Text>
            ) : (
              <View style={styles.stopsList}>
                {visibleStops.map((stop, index) => {
                  const isSelected = Boolean(selectedIds[stop.id]);
                  const isEditing = editingId === stop.id;
                  const isActive = activeStopId === stop.id;
                  return (
                    <View
                      key={stop.id}
                      style={[
                        styles.stopRow,
                        isSelected && styles.stopRowSelected,
                        isEditing && styles.stopRowEditing,
                      ]}
                    >
                      <View style={styles.stopRowHeader}>
                        <Text style={styles.stopIndex}>{index + 1}</Text>
                        {isEditing ? (
                          <View style={styles.editContainer}>
                            <TextInput
                              style={styles.editInput}
                              value={editingValue}
                              onChangeText={setEditingValue}
                              multiline
                              autoCapitalize="none"
                              autoCorrect={false}
                              editable={!saving}
                            />
                            <View style={styles.stopActions}>
                              <Pressable
                                style={({ pressed }) => [styles.primaryChip, pressed && styles.primaryChipPressed]}
                                onPress={handleSubmitEdit}
                                disabled={saving}
                              >
                                <Text style={styles.primaryChipText}>
                                  {saving ? 'Saving…' : 'Save'}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [styles.secondaryChip, pressed && styles.secondaryChipPressed]}
                                onPress={handleCancelEdit}
                                disabled={saving}
                              >
                                <Text style={styles.secondaryChipText}>Cancel</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable
                            style={styles.stopRowContent}
                            onPress={() => setActiveStopId((prev) => (prev === stop.id ? null : stop.id))}
                          >
                            <Text style={styles.stopAddress} numberOfLines={2}>
                              {stop.address}
                            </Text>
                            <Text style={styles.stopStatus}>
                              Status: {stop.status === 'complete' ? 'Complete' : 'Pending'}
                            </Text>
                          </Pressable>
                        )}
                      </View>

                      {!isEditing && isActive ? (
                        <View style={styles.stopActions}>
                          <Pressable
                            style={({ pressed }) => [styles.primaryChip, pressed && styles.primaryChipPressed]}
                            onPress={() => handleStartEdit(stop)}
                            disabled={saving}
                          >
                            <Text style={styles.primaryChipText}>Edit</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.primaryChip, pressed && styles.primaryChipPressed]}
                            onPress={() => handleStartLocationEdit(stop)}
                            disabled={saving || updatingLocation || forgettingCache}
                          >
                            <Text style={styles.primaryChipText}>
                              {Platform.OS === 'web' ? 'Select pin' : 'Adjust pin'}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.dangerChip, pressed && styles.dangerChipPressed]}
                            onPress={() => handleDeleteStop(stop.id)}
                            disabled={saving}
                          >
                            <Text style={styles.dangerChipText}>Delete</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.secondaryChip, pressed && styles.secondaryChipPressed]}
                            onPress={() => handleForgetCacheForStop(stop)}
                            disabled={forgettingCache}
                          >
                            <Text style={styles.secondaryChipText}>
                              {forgettingCache ? 'Clearing…' : 'Forget cache'}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.secondaryChip, pressed && styles.secondaryChipPressed]}
                            onPress={() => handleToggleSelect(stop.id)}
                            disabled={saving}
                          >
                            <Text style={styles.secondaryChipText}>
                              {isSelected ? 'Unselect' : 'Select'}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )
          ) : (
            <Text style={styles.emptyText}>
              Tap “Display addresses” to manage this driver’s stops.
            </Text>
          )}
        </View>
      </ScrollView>
      {showStopsList && normalizedQuery.length === 0 ? (
        <Pressable
          style={({ pressed }) => [styles.listFab, pressed && styles.listFabPressed]}
          accessibilityRole="button"
          onPress={() => {
            Keyboard.dismiss();
            setShowStopsList(false);
          }}
        >
          <Text style={styles.listFabText}>Hide addresses</Text>
      </Pressable>
      ) : null}

      {pinEditor
        ? Platform.OS === 'web'
          ? (
            <View style={styles.pinModalWebWrapper}>
              <View style={styles.pinModalOverlay}>
                <View style={styles.pinModalCard}>
                  <Text style={styles.pinModalTitle}>Adjust pin location</Text>
                  <Text style={styles.pinModalBody}>
                    Drag the marker or tap anywhere on the map. Saving updates the cached coordinates so
                    future runs remember this exact spot.
                  </Text>
                  <View style={styles.pinMap}>
                    <StopLocationEditor
                      coordinate={pinEditor.coordinate}
                      onChange={handleUpdatePinCoordinate}
                    />
                  </View>
                  <View style={styles.pinModalActions}>
                    <Pressable
                      style={({ pressed }) => [styles.pinModalButton, pressed && styles.pinModalButtonPressed]}
                      onPress={() => {
                        if (!updatingLocation) {
                          setPinEditor(null);
                        }
                      }}
                      disabled={updatingLocation}
                    >
                      <Text style={styles.pinModalButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.pinModalPrimaryButton,
                        pressed && styles.pinModalPrimaryPressed,
                      ]}
                      onPress={handleSavePinLocation}
                      disabled={updatingLocation}
                    >
                      <Text style={styles.pinModalPrimaryText}>
                        {updatingLocation ? 'Saving…' : 'Save pin'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          )
          : (
            <Modal
              transparent
              animationType="fade"
              visible
              onRequestClose={() => {
                if (!updatingLocation) {
                  setPinEditor(null);
                }
              }}
            >
              <View style={styles.pinModalOverlay}>
                <View style={styles.pinModalCard}>
                  <Text style={styles.pinModalTitle}>Adjust pin location</Text>
                  <Text style={styles.pinModalBody}>
                    Drag the marker or tap anywhere on the map. Saving updates the cached coordinates so
                    future runs remember this exact spot.
                  </Text>
                  <View style={styles.pinMap}>
                    <StopLocationEditor
                      coordinate={pinEditor.coordinate}
                      onChange={handleUpdatePinCoordinate}
                    />
                  </View>
                  <View style={styles.pinModalActions}>
                    <Pressable
                      style={({ pressed }) => [styles.pinModalButton, pressed && styles.pinModalButtonPressed]}
                      onPress={() => {
                        if (!updatingLocation) {
                          setPinEditor(null);
                        }
                      }}
                      disabled={updatingLocation}
                    >
                      <Text style={styles.pinModalButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.pinModalPrimaryButton,
                        pressed && styles.pinModalPrimaryPressed,
                      ]}
                      onPress={handleSavePinLocation}
                      disabled={updatingLocation}
                    >
                      <Text style={styles.pinModalPrimaryText}>
                        {updatingLocation ? 'Saving…' : 'Save pin'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          )
        : null}

      {Platform.OS === 'web' ? (
        <Modal
          transparent
          animationType="fade"
          visible={deleteConfirmVisible}
          onRequestClose={handleCancelDeleteDialog}
        >
          <View style={styles.deleteModalOverlay}>
            <View style={styles.deleteModalCard}>
              <Text style={styles.deleteModalTitle}>Delete account?</Text>
              <Text style={styles.deleteModalBody}>
                This removes the account and anonymizes any remaining data. This action cannot be undone.
              </Text>
              <View style={styles.deleteModalActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.deleteModalButton,
                    pressed && styles.deleteModalButtonPressed,
                  ]}
                  onPress={handleCancelDeleteDialog}
                  disabled={deletingAccount}
                >
                  <Text style={styles.deleteModalButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.deleteModalDangerButton,
                    pressed && styles.deleteModalDangerButtonPressed,
                  ]}
                  onPress={handleConfirmDeleteDialog}
                  disabled={deletingAccount}
                >
                  <Text style={styles.deleteModalDangerButtonText}>
                    {deletingAccount ? 'Deleting…' : 'Delete'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const onPrimary = isDark ? colors.background : colors.surface;
  const isWeb = Platform.OS === 'web';
  const paddingTop = isWeb ? 32 : 24;
  const paddingBottom = isWeb ? 32 : 48;
  const headerFlexDirection = isWeb ? 'row' : 'column';
  const headerAlignItems = isWeb ? 'center' : 'flex-start';
  const headerJustify = isWeb ? 'space-between' : 'flex-start';
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingTop,
      paddingBottom,
    },
    header: {
      width: '100%',
      flexDirection: headerFlexDirection,
      justifyContent: headerJustify,
      alignItems: headerAlignItems,
      marginBottom: 24,
      gap: isWeb ? 16 : 12,
    },
    headerInfo: {
      flex: isWeb ? 1 : undefined,
      width: '100%',
      marginRight: isWeb ? 16 : 0,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    subTitle: {
      marginTop: 4,
      color: colors.mutedText,
    },
    backButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: colors.primaryMuted,
      minWidth: 150,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonPressed: {
      opacity: 0.9,
    },
    backButtonText: {
      color: colors.primary,
      fontWeight: '600',
    },
    content: {
      gap: 24,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 16,
      position: 'relative',
    },
    cardHeading: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    cardHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    collapseSection: {
      gap: 12,
      alignItems: isWeb ? 'flex-start' : 'stretch',
    },
    collapseToggle: {
      alignSelf: isWeb ? 'flex-start' : 'stretch',
      minWidth: isWeb ? 240 : undefined,
      maxWidth: isWeb ? 360 : undefined,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingVertical: 12,
      backgroundColor: colors.surface,
    },
    collapseTogglePressed: {
      opacity: 0.85,
    },
    collapseToggleLabel: {
      fontWeight: '600',
      color: colors.text,
      textAlign: isWeb ? 'left' : 'center',
      width: '100%',
    },
    accountSection: {
      gap: 20,
    },
    mapNote: {
      marginTop: 8,
      color: colors.mutedText,
      fontSize: 12,
    },
    accountActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    accountForm: {
      gap: 10,
      marginBottom: 8,
    },
    accountLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    accountInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.background,
    },
    accountPrimaryButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primaryMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountPrimaryButtonText: {
      color: colors.primary,
      fontWeight: '600',
    },
    accountButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primaryMuted,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 150,
    },
    accountButtonDanger: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.danger,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.dangerMuted,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 150,
    },
    accountButtonPressed: {
      opacity: 0.9,
    },
    accountButtonLabel: {
      color: colors.primary,
      fontWeight: '600',
    },
    accountButtonDangerLabel: {
      color: colors.danger,
      fontWeight: '600',
    },
    promoteButton: {
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.primary,
      marginTop: 4,
    },
    promoteButtonPressed: {
      opacity: 0.9,
    },
    promoteButtonDisabled: {
      opacity: 0.6,
    },
    promoteButtonText: {
      fontWeight: '600',
    },
    textArea: {
      minHeight: 200,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.background,
      textAlignVertical: 'top',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    primaryButton: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primary,
    },
    primaryButtonPressed: {
      opacity: 0.9,
    },
    primaryButtonText: {
      color: onPrimary,
      fontWeight: '600',
    },
    dangerButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.danger,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.dangerMuted,
    },
    dangerButtonPressed: {
      opacity: 0.9,
    },
    dangerButtonText: {
      color: colors.danger,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    error: {
      color: colors.danger,
    },
    success: {
      color: colors.success,
    },
    searchHeader: {
      flexDirection: isWeb ? 'row' : 'column',
      alignItems: 'stretch',
      gap: 12,
      alignSelf: isWeb ? 'flex-start' : 'stretch',
      width: isWeb ? undefined : '100%',
      maxWidth: isWeb ? 520 : undefined,
    },
    searchInput: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.background,
      minWidth: isWeb ? 0 : undefined,
    },
    displayButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primaryMuted,
      alignItems: 'center',
      alignSelf: isWeb ? 'flex-start' : 'flex-end',
      minWidth: isWeb ? 160 : undefined,
      maxWidth: isWeb ? 240 : undefined,
    },
    displayButtonPressed: {
      opacity: 0.9,
    },
    displayButtonText: {
      color: colors.primary,
      fontWeight: '600',
    },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.primaryMuted,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    selectionText: {
      color: colors.primary,
      fontWeight: '600',
    },
    dangerChip: {
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 14,
      backgroundColor: colors.dangerMuted,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    dangerChipPressed: {
      opacity: 0.9,
    },
    dangerChipText: {
      color: colors.danger,
      fontWeight: '600',
    },
    loaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    loaderText: {
      color: colors.mutedText,
    },
    stopsList: {
      gap: 12,
    },
    stopRow: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 10,
    },
    stopRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
    },
    stopRowEditing: {
      borderColor: colors.success,
      backgroundColor: colors.successMuted,
    },
    stopRowHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    stopIndex: {
      width: 24,
      textAlign: 'center',
      fontWeight: '700',
      color: colors.primary,
      paddingTop: 2,
    },
    stopRowContent: {
      flex: 1,
      gap: 4,
    },
    stopAddress: {
      color: colors.text,
      fontWeight: '500',
    },
    stopStatus: {
      fontSize: 12,
      color: colors.mutedText,
    },
    stopActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    primaryChip: {
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
    },
    primaryChipPressed: {
      opacity: 0.9,
    },
    primaryChipText: {
      color: onPrimary,
      fontWeight: '600',
    },
    secondaryChip: {
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondaryChipPressed: {
      opacity: 0.9,
    },
    secondaryChipText: {
      color: colors.primary,
      fontWeight: '600',
    },
    editContainer: {
      flex: 1,
      gap: 8,
    },
    editInput: {
      minHeight: 80,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
      textAlignVertical: 'top',
    },
    listFab: {
      position: 'absolute',
      right: 24,
      bottom: 32,
      borderRadius: 999,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primary,
      shadowColor: colors.text,
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 8,
      elevation: 4,
    },
    listFabPressed: {
      opacity: 0.9,
    },
    listFabText: {
      color: onPrimary,
      fontWeight: '600',
    },
    emptyText: {
      color: colors.mutedText,
    },
    deleteModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      padding: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteModalCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 16,
      padding: 24,
      backgroundColor: colors.surface,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.text,
      shadowOpacity: 0.15,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    deleteModalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    deleteModalBody: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    deleteModalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    deleteModalButton: {
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    deleteModalButtonPressed: {
      opacity: 0.85,
    },
    deleteModalButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    deleteModalDangerButton: {
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.dangerMuted,
    },
    deleteModalDangerButtonPressed: {
      opacity: 0.9,
    },
    deleteModalDangerButtonText: {
      color: colors.danger,
      fontWeight: '600',
    },
    pinModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      padding: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pinModalWebWrapper: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 999,
    },
    pinModalCard: {
      width: '100%',
      maxWidth: 720,
      borderRadius: 20,
      padding: 24,
      backgroundColor: colors.surface,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pinModalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    pinModalBody: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    pinMap: {
      height: 360,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    pinModalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    pinModalButton: {
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    pinModalButtonPressed: {
      opacity: 0.85,
    },
    pinModalButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    pinModalPrimaryButton: {
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.primary,
    },
    pinModalPrimaryPressed: {
      opacity: 0.9,
    },
    pinModalPrimaryText: {
      color: onPrimary,
      fontWeight: '600',
    },
  });
}

function getHouseNumber(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}
