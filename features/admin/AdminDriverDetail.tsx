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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { DriverStop, DriverSummary } from '@/features/auth/types';
import type { Stop } from '@/features/route-planner/types';
import { MapScreen } from '@/features/route-planner/MapScreen';
import { SettingsMenu } from '@/components/SettingsMenu';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

const MAX_ADDRESSES = 150;

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
    user: authUser,
    deleteAccount,
    signOut,
    changePassword,
    getProfile,
    updateProfile,
    resetUserPassword,
    deleteUserAccount,
    adminUpdateUserProfile,
    adminUpdateUserPassword,
    verifyPassword,
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
  const [resettingPassword, setResettingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountContact, setAccountContact] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [addStopsExpanded, setAddStopsExpanded] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const accountNameInputRef = useRef<TextInput | null>(null);
  const accountContactInputRef = useRef<TextInput | null>(null);
  const driverPasswordInputRef = useRef<TextInput | null>(null);
  const driverPasswordConfirmInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    async function loadDriver() {
      try {
        setLoadingDriver(true);
        const drivers = await authApi.fetchDrivers(token);
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
  }, [token, driverId, refreshSignal]);

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
    if (!token) {
      return;
    }
    async function loadStops() {
      try {
        setLoadingStops(true);
        const result = await authApi.fetchDriverStops(token, driverId);
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
  }, [token, driverId, refreshSignal]);

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
      setError(`You can geocode up to ${MAX_ADDRESSES} addresses at once.`);
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
      setError(`You can geocode up to ${MAX_ADDRESSES} addresses at once.`);
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
      Alert.alert('Account deleted', 'The account and any saved data were removed.');
      if (onRefresh) {
        await Promise.resolve(onRefresh());
      }
      onClose();
    } catch (err) {
      const message = getFriendlyError(err, {
        fallback: "We couldn't delete that account yet. Try again.",
      });
      Alert.alert('Delete failed', message);
    } finally {
      setDeletingAccount(false);
    }
  };

  const confirmDeleteDriverAccount = () => {
    if (!driver || deletingAccount) {
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
        <SettingsMenu
          userName={authUser?.fullName}
          userRole={authUser?.role ?? 'admin'}
          onDeleteAccount={deleteAccount}
          onSignOut={signOut}
          onChangePassword={changePassword}
          onGetProfile={getProfile}
          onUpdateProfile={updateProfile}
          onVerifyPassword={verifyPassword}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Driver assignment</Text>
          {driver ? (
            <Text style={styles.subTitle} numberOfLines={1}>
              {driver.fullName || driver.emailOrPhone}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          onPress={onClose}
        >
          <Text style={styles.closeButtonText}>Back</Text>
        </Pressable>
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
              <View style={styles.accountSection}>
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
                  ? `Showing ${mapPins.length} pinned stop${mapPins.length === 1 ? '' : 's'}.`
                  : 'Assign stops to see pins here.'}
              </Text>
              <MapScreen pins={mapPins} loading={loadingStops} />
              <Text style={styles.mapNote}>
                This view matches what drivers see, including satellite and full-screen controls.
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
                            style={({ pressed }) => [styles.dangerChip, pressed && styles.dangerChipPressed]}
                            onPress={() => handleDeleteStop(stop.id)}
                            disabled={saving}
                          >
                            <Text style={styles.dangerChipText}>Delete</Text>
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
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const onPrimary = isDark ? colors.background : colors.surface;
  const isWeb = Platform.OS === 'web';
  const paddingTop = isWeb ? 32 : 24;
  const paddingBottom = isWeb ? 32 : 48;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingTop,
      paddingBottom,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
      gap: 16,
    },
    headerInfo: {
      flex: 1,
      marginRight: 16,
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
    closeButton: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
    },
    closeButtonPressed: {
      opacity: 0.85,
    },
    closeButtonText: {
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
    },
    collapseToggle: {
      alignSelf: Platform.OS === 'web' ? 'flex-start' : 'stretch',
      minWidth: Platform.OS === 'web' ? 240 : undefined,
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
      textAlign: Platform.OS === 'web' ? 'left' : 'center',
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
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
    },
    displayButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primaryMuted,
      alignItems: 'center',
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
  });
}

function getHouseNumber(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }
  const match = address.trim().match(/^(\d+[A-Za-z0-9-]*)\b/);
  return match ? match[1] : null;
}
