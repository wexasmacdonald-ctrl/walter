import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/features/theme/theme-context';
import { useAuth } from '@/features/auth/auth-context';
import { openPrivacyPolicy, openTermsOfUse } from '@/features/legal/legal-documents';
import type { AuthUser, BusinessTier } from '@/features/auth/types';
import type { OrgBillingStatus, SyncDriverSeatResult } from '@/features/auth/api';

const isIOS = Platform.OS === 'ios';
const EXISTING_CUSTOMER_NOTICE =
  'This mobile app is for existing customers. Ask your administrator to manage billing on the web dashboard.';

type SettingsMenuProps = {
  userName: string | null | undefined;
  userRole: string;
  businessTier: BusinessTier;
  businessName?: string | null;
  billingStatus?: OrgBillingStatus | null;
  billingLoading?: boolean;
  workspaceId?: string | null;
  onBootstrapWorkspace?: (input: { name: string }) => Promise<unknown>;
  onAttachWorkspace?: (input: { workspaceId: string }) => Promise<unknown>;
  onRefreshBillingStatus?: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onGetProfile: () => Promise<{
    fullName: string | null;
    emailOrPhone: string | null;
    businessName: string | null;
    businessTier: BusinessTier;
  }>;
  onUpdateProfile: (profile: {
    fullName?: string | null;
    emailOrPhone?: string;
    businessName?: string | null;
  }) => Promise<{
    fullName: string | null;
    emailOrPhone: string | null;
    businessName: string | null;
    businessTier: BusinessTier;
  }>;
  onVerifyPassword: (password: string) => Promise<void>;
  onAfterDeleteAccount?: () => void | Promise<void>;
  onApplyTeamAccessCode: (code: string) => Promise<AuthUser>;
  onSyncDriverSeats?: () => Promise<SyncDriverSeatResult>;
};

type ProcessingAction = null | 'account' | 'profile' | 'password';
type MenuView = 'main' | 'profile' | 'password';

export function SettingsMenu({
  userName,
  userRole,
  businessTier,
  businessName,
  billingStatus,
  billingLoading,
  workspaceId,
  onBootstrapWorkspace,
  onAttachWorkspace,
  onRefreshBillingStatus,
  onDeleteAccount,
  onSignOut,
  onChangePassword,
  onGetProfile,
  onUpdateProfile,
  onVerifyPassword,
  onAfterDeleteAccount,
  onApplyTeamAccessCode,
  onSyncDriverSeats,
}: SettingsMenuProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { token } = useAuth();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<MenuView>('main');
  const [processing, setProcessing] = useState<ProcessingAction>(null);

  const [profileName, setProfileName] = useState('');
  const [profileContact, setProfileContact] = useState('');
  const [profileBusinessName, setProfileBusinessName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [confirmProcessing, setConfirmProcessing] = useState(false);

  const [teamCode, setTeamCode] = useState('');
  const [teamCodeStatus, setTeamCodeStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [teamCodeError, setTeamCodeError] = useState<string | null>(null);
  const [teamCodeMessage, setTeamCodeMessage] = useState<string | null>(null);
  const showTeamCodeForm = false; // invite codes removed; drivers now request access via admins
  const currentWorkspaceId = billingStatus?.orgId ?? workspaceId ?? null;
  const showDevTools = userRole === 'dev' && (!!onBootstrapWorkspace || !!onAttachWorkspace);
  const normalizedPlanTier =
    billingStatus?.planTier ??
    (billingStatus?.numberOfDrivers
      ? billingStatus.numberOfDrivers <= 10
        ? 'small'
        : billingStatus.numberOfDrivers <= 25
          ? 'medium'
          : 'large'
      : null);
  const planBadgeLabel = normalizedPlanTier
    ? `Business · ${normalizedPlanTier.charAt(0).toUpperCase()}${normalizedPlanTier.slice(1)} plan`
    : businessTier === 'business'
      ? 'Business tier'
      : 'Free tier';
  const planLimitLabel = normalizedPlanTier
    ? normalizedPlanTier === 'small'
      ? 'Up to 10 drivers'
      : normalizedPlanTier === 'medium'
        ? 'Up to 25 drivers'
        : billingStatus?.numberOfDrivers
          ? `Up to ${billingStatus.numberOfDrivers} drivers`
          : 'Custom driver cap'
    : '30 stops / 24 hrs';
  const [devWorkspaceName, setDevWorkspaceName] = useState('');
  const [devBootstrapStatus, setDevBootstrapStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [devBootstrapMessage, setDevBootstrapMessage] = useState<string | null>(null);
  const [devAttachWorkspaceId, setDevAttachWorkspaceId] = useState('');
  const [devAttachStatus, setDevAttachStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [devAttachMessage, setDevAttachMessage] = useState<string | null>(null);
  const [driverSeatError, setDriverSeatError] = useState<string | null>(null);
  const [driverSeatMessage, setDriverSeatMessage] = useState<string | null>(null);
  const [driverSeatSaving, setDriverSeatSaving] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const seatLimit = billingStatus?.numberOfDrivers ?? null;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const resetState = useCallback(() => {
    setView('main');
    setProcessing(null);
    setProfileName('');
    setProfileContact('');
    setProfileBusinessName('');
    setProfileError(null);
    setPasswordError(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setConfirmPasswordInput('');
    setConfirmPasswordError(null);
    setConfirmProcessing(false);
    setTeamCode('');
    setTeamCodeError(null);
    setTeamCodeStatus('idle');
    setTeamCodeMessage(null);
    setDevWorkspaceName('');
    setDevBootstrapStatus('idle');
    setDevBootstrapMessage(null);
    setDevAttachWorkspaceId('');
    setDevAttachStatus('idle');
    setDevAttachMessage(null);
    setDriverSeatError(null);
    setDriverSeatMessage(null);
    setDriverSeatSaving(false);
    setCheckoutLoading(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      resetState();
    }
  }, [visible, resetState]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return undefined;
    }
    const handler = (event: MessageEvent) => {
      if (event?.data && typeof event.data === 'object' && event.data.type === 'billingUpdated') {
        onRefreshBillingStatus?.();
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
    };
  }, [onRefreshBillingStatus]);

  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        onRefreshBillingStatus?.();
      }
      appStateRef.current = next;
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [onRefreshBillingStatus]);

  const handleOpenMenu = () => {
    setVisible(true);
  };

  const handleCloseMenu = () => {
    if (processing) {
      return;
    }
    setVisible(false);
  };

  const openConfirmDelete = () => {
    setConfirmVisible(true);
    setConfirmPasswordInput('');
    setConfirmPasswordError(null);
    setConfirmProcessing(false);
  };

  const handleConfirmDelete = async () => {
    if (!confirmPasswordInput) {
      setConfirmPasswordError('Enter your current password.');
      return;
    }
    setConfirmPasswordError(null);
    setConfirmProcessing(true);
    try {
      setProcessing('account');
      await onVerifyPassword(confirmPasswordInput);
      setConfirmVisible(false);
      setConfirmPasswordInput('');
      await onDeleteAccount();
      Alert.alert('Account deleted', 'Your account has been removed.');
      await onAfterDeleteAccount?.();
      setVisible(false);
      setView('main');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Password verification failed.';
      setConfirmPasswordError(message);
    } finally {
      setProcessing(null);
      setConfirmProcessing(false);
    }
  };

  const handleCancelConfirm = () => {
    if (confirmProcessing) {
      return;
    }
    setConfirmVisible(false);
    setConfirmPasswordInput('');
    setConfirmPasswordError(null);
  };

  const handleSignOut = async () => {
    try {
      setProcessing(null);
      await onSignOut();
      setVisible(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Please try again or contact support.';
      Alert.alert('Sign out failed', message);
    }
  };

  const handleOpenLegal = (openDoc: () => void) => {
    if (processing) {
      return;
    }
    if (confirmVisible) {
      setConfirmVisible(false);
    }
    setVisible(false);
    setTimeout(() => {
      openDoc();
    }, 250);
  };

  const handleOpenTerms = () => handleOpenLegal(openTermsOfUse);
  const handleOpenPrivacy = () => handleOpenLegal(openPrivacyPolicy);

  const loadProfile = async () => {
    setProfileError(null);
    setProfileLoading(true);
    try {
      const profile = await onGetProfile();
      setProfileName(profile.fullName ?? '');
      setProfileContact(profile.emailOrPhone ?? '');
      setProfileBusinessName(profile.businessName ?? '');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load account profile.';
      setProfileError(message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleOpenProfile = () => {
    setView('profile');
    void loadProfile();
  };

  const handleSaveProfile = async () => {
    if (processing === 'profile') {
      return;
    }
    const contact = profileContact.trim();
    if (!contact) {
      setProfileError('Email or phone cannot be empty.');
      return;
    }

    setProfileError(null);
    setProcessing('profile');
    try {
    const payload: {
      fullName?: string | null;
      emailOrPhone?: string;
      businessName?: string | null;
    } = {};
    payload.fullName = profileName.trim() === '' ? null : profileName.trim();
    payload.emailOrPhone = contact;
    payload.businessName =
      profileBusinessName.trim() === '' ? null : profileBusinessName.trim();

    const updated = await onUpdateProfile(payload);
    setProfileName(updated.fullName ?? '');
    setProfileContact(updated.emailOrPhone ?? '');
    setProfileBusinessName(updated.businessName ?? '');
      Alert.alert('Profile updated', 'Account details saved.');
      setView('main');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update profile.';
      setProfileError(message);
    } finally {
      setProcessing(null);
    }
  };

  const handleOpenPassword = () => {
    setView('password');
    setPasswordError(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSavePassword = async () => {
    if (processing === 'password') {
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Enter your current password and a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    try {
      setProcessing('password');
      await onChangePassword(currentPassword, newPassword);
      Alert.alert('Password updated', 'Your password has been changed.');
      setView('main');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to change password.';
      setPasswordError(message);
    } finally {
      setProcessing(null);
    }
  };

  const handleApplyTeamCode = async () => {
    if (teamCodeStatus === 'loading') {
      return;
    }
    const trimmed = teamCode.trim();
    if (!trimmed) {
      setTeamCodeError('Enter your workspace invite code.');
      return;
    }
    setTeamCodeStatus('loading');
    setTeamCodeError(null);
    setTeamCodeMessage(null);
    try {
      const updated = await onApplyTeamAccessCode(trimmed);
      setTeamCode('');
      setTeamCodeStatus('success');
      setTeamCodeMessage(
        updated.businessName
          ? `${updated.businessName} workspace unlocked.`
          : 'Business tier unlocked for your account.'
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'We could not verify that access code. Try again.';
      setTeamCodeError(message);
      setTeamCodeStatus('idle');
    }
  };

  const handleBootstrapWorkspace = useCallback(async () => {
    if (!onBootstrapWorkspace) {
      setDevBootstrapStatus('error');
      setDevBootstrapMessage('Bootstrap endpoint unavailable.');
      return;
    }
    const trimmed = devWorkspaceName.trim();
    setDevBootstrapStatus('loading');
    setDevBootstrapMessage(null);
    try {
      await onBootstrapWorkspace({ name: trimmed || `Workspace ${new Date().toISOString()}` });
      setDevBootstrapStatus('success');
      setDevBootstrapMessage('Workspace created and attached.');
      setDevWorkspaceName('');
      await onRefreshBillingStatus?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to bootstrap workspace.';
      setDevBootstrapStatus('error');
      setDevBootstrapMessage(message);
    }
  }, [devWorkspaceName, onBootstrapWorkspace, onRefreshBillingStatus]);

  const handleAttachWorkspace = useCallback(async () => {
    if (!onAttachWorkspace) {
      setDevAttachStatus('error');
      setDevAttachMessage('Attach endpoint unavailable.');
      return;
    }
    const trimmed = devAttachWorkspaceId.trim();
    if (!trimmed) {
      setDevAttachStatus('error');
      setDevAttachMessage('Enter a workspace ID.');
      return;
    }
    setDevAttachStatus('loading');
    setDevAttachMessage(null);
    try {
      await onAttachWorkspace({ workspaceId: trimmed });
      setDevAttachStatus('success');
      setDevAttachMessage('Workspace attached to your account.');
      setDevAttachWorkspaceId('');
      await onRefreshBillingStatus?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to attach workspace.';
      setDevAttachStatus('error');
      setDevAttachMessage(message);
    }
  }, [devAttachWorkspaceId, onAttachWorkspace, onRefreshBillingStatus]);

  const handleStartCheckout = useCallback(
    async (seatCountOverride?: number) => {
      if (isIOS) {
        setDriverSeatMessage(EXISTING_CUSTOMER_NOTICE);
        return;
      }
      if (checkoutLoading) {
        return;
      }
      if (!currentWorkspaceId || !token) {
        Alert.alert('Workspace required', 'Join or create a workspace before updating billing.');
        return;
      }
      const seatCount =
        seatCountOverride && seatCountOverride > 0
          ? seatCountOverride
          : seatLimit && seatLimit > 0
            ? seatLimit
            : 1;
      setCheckoutLoading(true);
      try {
        const resp = await fetch('https://blow-api.wexasmacdonald.workers.dev/billing/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-workspace-id': currentWorkspaceId,
          },
          body: JSON.stringify({
            numberOfDrivers: seatCount,
          }),
        });

        const text = await resp.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          // ignore non-JSON bodies
        }

        if (!resp.ok || !data?.checkoutUrl) {
          console.error('Billing error', resp.status, data ?? text);
          const message =
            data?.message ??
            (resp.status === 400 ? 'Workspace not ready for billing.' : 'Could not start checkout.');
          Alert.alert('Billing error', message);
          return;
        }

        const url = String(data.checkoutUrl);
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          Alert.alert('Error', 'Cannot open Stripe checkout URL.');
          return;
        }

        await Linking.openURL(url);
      } catch (error) {
        console.error('Checkout request failed', error);
        Alert.alert('Error', 'Network error talking to billing.');
      } finally {
        setCheckoutLoading(false);
      }
    },
    [checkoutLoading, currentWorkspaceId, token, seatLimit]
  );

  const handleSyncDriverSeats = useCallback(async () => {
    if (!onSyncDriverSeats || driverSeatSaving) {
      return;
    }
    setDriverSeatSaving(true);
    setDriverSeatError(null);
    setDriverSeatMessage(null);
    try {
      const result = await onSyncDriverSeats();
      if (result.action === 'checkout') {
        if (isIOS) {
          setDriverSeatMessage(EXISTING_CUSTOMER_NOTICE);
        } else {
          setDriverSeatMessage('Redirecting to billing checkout for updated seats.');
          await handleStartCheckout(result.numberOfDrivers);
        }
      } else {
        const message =
          result.action === 'updated'
            ? `Seat limit aligned to ${result.numberOfDrivers} driver${result.numberOfDrivers === 1 ? '' : 's'}.`
            : 'Driver seats already match your member count.';
        setDriverSeatMessage(message);
        await onRefreshBillingStatus?.();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sync driver seats.';
      setDriverSeatError(message);
    } finally {
      setDriverSeatSaving(false);
    }
  }, [driverSeatSaving, onSyncDriverSeats, handleStartCheckout, onRefreshBillingStatus]);

  const renderMainView = () => (
    <>
    <View style={styles.profileCard}>
      <Text style={styles.profileName}>{userName ? userName : 'Signed user'}</Text>
      <Text style={styles.profileRole}>{userRole}</Text>
      <Text style={styles.profilePlan}>
        {businessTier === 'business'
            ? `Workspace: ${businessName?.trim() || 'Business workspace'}`
            : businessName?.trim()
            ? `Workspace: ${businessName} (free tier)`
            : 'No workspace selected'}
        </Text>
      </View>

      {userRole !== 'driver' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan & team</Text>
          <View style={styles.planCard}>
            <View style={styles.planHeaderRow}>
              <Text style={styles.planBadge}>
                {planBadgeLabel}
              </Text>
              <Text style={styles.planLimit}>
                {planLimitLabel}
              </Text>
            </View>
          <Text style={styles.planDescription}>
            {businessTier === 'business'
              ? 'Your workspace includes unlimited stops.'
              : 'Free accounts can geocode up to 30 new stops every 24 hours. Upgrade your workspace to business for unlimited stops.'}
          </Text>
          <Text style={styles.planTeamName}>
            {businessName?.trim()
          ? `Workspace: ${businessName}`
            : 'Add a workspace name from Account details.'}
      </Text>
      {billingLoading ? (
        <Text style={styles.profilePlan}>Checking billing status…</Text>
      ) : billingStatus ? (
        <>
          <Text style={styles.planMeta}>
            Status: {billingStatus.billingStatus ?? 'unknown'}
          </Text>
          <Text style={styles.planMeta}>
            Driver seats: {billingStatus.numberOfDrivers ?? 'n/a'}
          </Text>
        </>
      ) : null}
    </View>
          {currentWorkspaceId ? (
            <View style={styles.driverSeatBlock}>
              <Text style={styles.driverSeatTitle}>Driver seats & billing</Text>
              <Text style={styles.driverSeatHint}>
                Keep your seat allowance aligned with the people you’ve added to this workspace. We’ll open Stripe only
                when the plan needs to change.
              </Text>
              <View style={styles.driverSeatMetaRow}>
                <View style={styles.driverSeatMeta}>
                  <Text style={styles.driverSeatMetaLabel}>Current allowance</Text>
                  <Text style={styles.driverSeatMetaValue}>
                    {seatLimit !== null ? `${seatLimit} driver${seatLimit === 1 ? '' : 's'}` : 'Not set'}
                  </Text>
                </View>
                <View style={styles.driverSeatMeta}>
                  <Text style={styles.driverSeatMetaLabel}>Billing status</Text>
                  <Text style={styles.driverSeatMetaValue}>
                    {billingStatus?.billingStatus ? billingStatus.billingStatus : 'Not active'}
                  </Text>
                </View>
              </View>
              {driverSeatMessage ? (
                <Text style={styles.driverSeatSuccess}>{driverSeatMessage}</Text>
              ) : null}
              {driverSeatError ? <Text style={styles.errorText}>{driverSeatError}</Text> : null}
              <View style={styles.driverSeatActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.driverSeatButton,
                    pressed && styles.driverSeatButtonPressed,
                    (!onSyncDriverSeats || driverSeatSaving) && styles.driverSeatButtonDisabled,
                  ]}
                  disabled={!onSyncDriverSeats || driverSeatSaving}
                  onPress={handleSyncDriverSeats}
                >
                  {driverSeatSaving ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={styles.driverSeatButtonText}>Sync with members</Text>
                  )}
                </Pressable>
                {!isIOS ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.driverSeatSecondaryButton,
                      pressed && styles.driverSeatButtonPressed,
                      checkoutLoading && styles.driverSeatButtonDisabled,
                    ]}
                    disabled={checkoutLoading}
                    onPress={() => handleStartCheckout()}
                  >
                    {checkoutLoading ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <Text style={styles.driverSeatSecondaryText}>Review billing in Stripe</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
              {isIOS ? (
                <Text style={styles.driverSeatHint}>{EXISTING_CUSTOMER_NOTICE}</Text>
              ) : null}
            </View>
          ) : null}
          {showTeamCodeForm ? (
            <View style={styles.teamCodeBlock}>
              <Text style={styles.formLabel}>Workspace invite code</Text>
              <Text style={styles.teamCodeHint}>
                Enter the workspace invite code from your dispatcher to join their workspace and unlock
                the business tier.
              </Text>
              <TextInput
                style={styles.teamCodeInput}
                placeholder="e.g. NORTHHUB-92A"
                placeholderTextColor={colors.mutedText}
                value={teamCode}
                onChangeText={(text) => {
                  setTeamCode(text);
                  if (teamCodeError) {
                    setTeamCodeError(null);
                  }
                  if (teamCodeStatus === 'success') {
                    setTeamCodeStatus('idle');
                    setTeamCodeMessage(null);
                  }
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                accessible
                accessibilityLabel="Workspace invite code"
              />
              {teamCodeError ? <Text style={styles.errorText}>{teamCodeError}</Text> : null}
              {teamCodeStatus === 'success' && teamCodeMessage ? (
                <Text style={styles.teamCodeSuccess}>{teamCodeMessage}</Text>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.teamCodeButton,
                  pressed && styles.teamCodeButtonPressed,
                  teamCodeStatus === 'loading' && styles.teamCodeButtonDisabled,
                ]}
                onPress={handleApplyTeamCode}
                disabled={teamCodeStatus === 'loading'}
              >
                {teamCodeStatus === 'loading' ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.teamCodeButtonText}>
                    {businessTier === 'business' ? 'Refresh workspace access' : 'Join workspace'}
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}
          {showDevTools ? (
            <View style={styles.devSection}>
              <Text style={styles.sectionTitle}>Developer tools</Text>
              <View style={styles.devCard}>
                <Text style={styles.devLabel}>Current workspace ID</Text>
                <Text style={styles.devValue}>{currentWorkspaceId ?? 'None assigned'}</Text>

                <Text style={styles.devLabel}>Create & attach workspace</Text>
                <TextInput
                  style={styles.devInput}
                  placeholder="Workspace name"
                  placeholderTextColor={colors.mutedText}
                  value={devWorkspaceName}
                  onChangeText={(text) => {
                    setDevWorkspaceName(text);
                    if (devBootstrapStatus === 'error') {
                      setDevBootstrapStatus('idle');
                      setDevBootstrapMessage(null);
                    }
                  }}
                />
                <Pressable
                  style={[
                    styles.devButton,
                    devBootstrapStatus === 'loading' && styles.devButtonDisabled,
                  ]}
                  onPress={handleBootstrapWorkspace}
                  disabled={devBootstrapStatus === 'loading'}
                >
                  <Text style={styles.devButtonText}>
                    {devBootstrapStatus === 'loading' ? 'Creating…' : 'Create workspace'}
                  </Text>
                </Pressable>
                {devBootstrapMessage ? (
                  <Text
                    style={
                      devBootstrapStatus === 'error' ? styles.devStatusError : styles.devStatusSuccess
                    }
                  >
                    {devBootstrapMessage}
                  </Text>
                ) : null}

                <Text style={styles.devLabel}>Attach existing workspace</Text>
                <TextInput
                  style={styles.devInput}
                  placeholder="Workspace ID (UUID)"
                  placeholderTextColor={colors.mutedText}
                  autoCapitalize="none"
                  value={devAttachWorkspaceId}
                  onChangeText={(text) => {
                    setDevAttachWorkspaceId(text);
                    if (devAttachStatus === 'error') {
                      setDevAttachStatus('idle');
                      setDevAttachMessage(null);
                    }
                  }}
                />
                <Pressable
                  style={[
                    styles.devButton,
                    devAttachStatus === 'loading' && styles.devButtonDisabled,
                  ]}
                  onPress={handleAttachWorkspace}
                  disabled={devAttachStatus === 'loading'}
                >
                  <Text style={styles.devButtonText}>
                    {devAttachStatus === 'loading' ? 'Attaching…' : 'Attach workspace'}
                  </Text>
                </Pressable>
                {devAttachMessage ? (
                  <Text
                    style={
                      devAttachStatus === 'error' ? styles.devStatusError : styles.devStatusSuccess
                    }
                  >
                    {devAttachMessage}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display</Text>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          onPress={toggleTheme}
        >
          <View style={styles.menuItemRow}>
            <Text style={styles.menuItemText}>Appearance</Text>
            <Text style={styles.menuItemHint}>{isDark ? 'Dark mode' : 'Light mode'}</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          onPress={handleOpenProfile}
        >
          <View style={styles.menuItemColumn}>
            <Text style={styles.menuItemText}>Account details</Text>
            <Text style={styles.menuItemHint}>Update name, email, or phone</Text>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          onPress={handleOpenPassword}
        >
          <View style={styles.menuItemColumn}>
            <Text style={styles.menuItemText}>Change password</Text>
            <Text style={styles.menuItemHint}>Update your login password</Text>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          onPress={handleSignOut}
        >
          <Text style={styles.menuItemText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <Pressable
          style={({ pressed }) => [
            styles.destructiveItem,
            pressed && styles.destructiveItemPressed,
          ]}
          onPress={openConfirmDelete}
          disabled={processing === 'account' || confirmVisible}
        >
          <View style={styles.destructiveRow}>
            <Text style={styles.destructiveItemText}>Delete account</Text>
            {processing === 'account' ? <ActivityIndicator color={colors.danger} /> : null}
          </View>
          <Text style={styles.destructiveHint}>
            Permanently removes your account and any remaining data.
          </Text>
        </Pressable>
      </View>

      <View style={styles.legalFooter}>
        <Text style={styles.legalFooterText}>
          Legal:{' '}
          <Text style={styles.legalFooterLink} onPress={handleOpenTerms}>
            Terms of Use
          </Text>{' '}
          |{' '}
          <Text style={styles.legalFooterLink} onPress={handleOpenPrivacy}>
            Privacy Policy
          </Text>
        </Text>
        <Text style={styles.legalOwnerText}>Developed by MacDonald AI.</Text>
      </View>
    </>
  );

  const renderProfileView = () => (
    <View style={styles.sheetGroup}>
      <Text style={styles.sheetTitle}>Account details</Text>
      <Text style={styles.sheetHint}>
        Update the name, contact info, or team name associated with this account.
      </Text>
      {profileLoading ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loaderText}>Loading profile…</Text>
        </View>
      ) : (
        <>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Full name</Text>
            <TextInput
              style={styles.formInput}
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Jane Doe"
              autoCapitalize="words"
              placeholderTextColor={colors.mutedText}
            />
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Email or phone</Text>
            <TextInput
              style={styles.formInput}
              value={profileContact}
              onChangeText={setProfileContact}
              placeholder="user@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholderTextColor={colors.mutedText}
            />
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Workspace name</Text>
            <TextInput
              style={styles.formInput}
              value={profileBusinessName}
              onChangeText={setProfileBusinessName}
              placeholder="Workspace name"
              autoCapitalize="words"
              placeholderTextColor={colors.mutedText}
            />
          </View>
          {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
          <View style={styles.formActions}>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={() => setView('main')}
              disabled={processing === 'profile'}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              onPress={handleSaveProfile}
              disabled={processing === 'profile'}
            >
              <Text style={styles.primaryButtonText}>
                {processing === 'profile' ? 'Saving…' : 'Save changes'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  const renderPasswordView = () => (
    <View style={styles.sheetGroup}>
      <Text style={styles.sheetTitle}>Change password</Text>
      <Text style={styles.sheetHint}>Choose a strong password at least 8 characters long.</Text>
      <View style={styles.formField}>
        <Text style={styles.formLabel}>Current password</Text>
        <TextInput
          style={styles.formInput}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          placeholder="Current password"
          placeholderTextColor={colors.mutedText}
        />
      </View>
      <View style={styles.formField}>
        <Text style={styles.formLabel}>New password</Text>
        <TextInput
          style={styles.formInput}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholder="New password"
          placeholderTextColor={colors.mutedText}
        />
      </View>
      <View style={styles.formField}>
        <Text style={styles.formLabel}>Confirm new password</Text>
        <TextInput
          style={styles.formInput}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="Confirm new password"
          placeholderTextColor={colors.mutedText}
        />
      </View>
      {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
      <View style={styles.formActions}>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={() => setView('main')}
          disabled={processing === 'password'}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleSavePassword}
          disabled={processing === 'password'}
        >
          <Text style={styles.primaryButtonText}>
            {processing === 'password' ? 'Saving…' : 'Update password'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderTrigger = () => {
    if (visible) {
      return null;
    }

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        onPress={handleOpenMenu}
        style={({ pressed }) => [styles.menuTrigger, pressed && styles.menuTriggerPressed]}
      >
        <View style={styles.hamburger}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </View>
      </Pressable>
    );
  };

  return (
    <>
      {renderTrigger()}
      <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={handleCloseMenu}>
        <SafeAreaView
          style={[styles.modalSafeArea, { backgroundColor: colors.background }]}
          edges={['left', 'right', 'bottom']}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            {view !== 'main' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to main menu"
                onPress={() => setView('main')}
                style={({ pressed }) => [styles.backTrigger, pressed && styles.backTriggerPressed]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.backTriggerLabel}>Back</Text>
              </Pressable>
            ) : (
              <View style={styles.modalHeaderSpacer} />
            )}
            <Text style={styles.modalTitle}>
              {view === 'main' ? 'Menu' : view === 'profile' ? 'Account details' : 'Change password'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={handleCloseMenu}
              disabled={Boolean(processing)}
              style={({ pressed }) => [
                styles.closeTrigger,
                pressed && styles.closeTriggerPressed,
              ]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeTriggerLabel}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {view === 'profile'
              ? renderProfileView()
              : view === 'password'
              ? renderPasswordView()
              : renderMainView()}
          </ScrollView>
          {confirmVisible ? (
            <View style={styles.confirmOverlay} pointerEvents="box-none">
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>Confirm account deletion</Text>
                <Text style={styles.confirmBody}>
                  Enter your current password to permanently delete your account.
                </Text>
                <TextInput
                  style={styles.confirmInput}
                  value={confirmPasswordInput}
                  onChangeText={setConfirmPasswordInput}
                  placeholder="Current password"
                  secureTextEntry
                  autoFocus
                  placeholderTextColor={colors.mutedText}
                />
                {confirmPasswordError ? (
                  <Text style={styles.confirmError}>{confirmPasswordError}</Text>
                ) : null}
                <View style={styles.confirmActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.confirmCancelButton,
                      pressed && styles.confirmCancelButtonPressed,
                    ]}
                    onPress={handleCancelConfirm}
                    disabled={confirmProcessing}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.confirmDeleteButton,
                      pressed && styles.confirmDeleteButtonPressed,
                      confirmProcessing && styles.confirmButtonDisabled,
                    ]}
                    onPress={handleConfirmDelete}
                    disabled={confirmProcessing}
                  >
                    {confirmProcessing ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <Text style={styles.confirmDeleteText}>Confirm</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const isWeb = Platform.OS === 'web';
  const constrainedWidth = isWeb ? 420 : undefined;
  return StyleSheet.create({
    menuTrigger: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'transparent',
    },
    menuTriggerPressed: {
      opacity: 0.85,
    },
    hamburger: {
      gap: 5,
      justifyContent: 'center',
      alignItems: 'center',
    },
    hamburgerLine: {
      width: 20,
      height: 3,
      borderRadius: 999,
      backgroundColor: colors.text,
    },
    modalSafeArea: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    modalHeaderSpacer: {
      width: 80,
      height: 32,
    },
    backTrigger: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    backTriggerPressed: {
      opacity: 0.85,
    },
    backTriggerLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    closeTrigger: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    closeTriggerPressed: {
      opacity: 0.85,
    },
    closeTriggerLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
      flex: 1,
    },
    modalContent: {
      padding: 24,
      gap: 24,
      backgroundColor: colors.background,
      alignItems: isWeb ? 'flex-start' : 'stretch',
    },
    confirmOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    confirmCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      gap: 16,
      elevation: 6,
      shadowColor: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(15, 23, 42, 0.2)',
      shadowOpacity: isDark ? 0.6 : 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    confirmBody: {
      color: colors.mutedText,
      fontSize: 14,
    },
    confirmInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    confirmError: {
      color: colors.danger,
      fontSize: 13,
    },
    confirmActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    confirmCancelButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    confirmCancelButtonPressed: {
      opacity: 0.9,
    },
    confirmCancelText: {
      color: colors.text,
      fontWeight: '600',
    },
    confirmDeleteButton: {
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.danger,
    },
    confirmDeleteButtonPressed: {
      opacity: 0.9,
    },
    confirmDeleteText: {
      color: colors.surface,
      fontWeight: '600',
    },
    confirmButtonDisabled: {
      opacity: 0.5,
    },
    profileCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 6,
      alignSelf: isWeb ? 'flex-start' : 'stretch',
      width: isWeb ? constrainedWidth : '100%',
    },
    profileName: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.text,
    },
    profileRole: {
      color: colors.mutedText,
      fontWeight: '500',
      textTransform: 'capitalize',
    },
    profilePlan: {
      color: colors.mutedText,
      fontSize: 13,
    },
    profileTeamName: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    section: {
      gap: 12,
      alignSelf: isWeb ? 'flex-start' : 'stretch',
      width: isWeb ? constrainedWidth : '100%',
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.mutedText,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    planCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 8,
    },
    planHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    planBadge: {
      color: colors.primary,
      fontWeight: '700',
      textTransform: 'uppercase',
      fontSize: 12,
    },
    planLimit: {
      color: colors.mutedText,
      fontWeight: '600',
      fontSize: 12,
    },
    planDescription: {
      color: colors.text,
    },
    planTeamName: {
      color: colors.mutedText,
      fontSize: 12,
    },
    planMeta: {
      color: colors.mutedText,
      fontSize: 12,
      marginTop: 4,
    },
    teamCodeBlock: {
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
    },
    devSection: {
      marginTop: 16,
      gap: 12,
    },
    devCard: {
      gap: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
    },
    devLabel: {
      color: colors.mutedText,
      fontSize: 12,
      fontWeight: '600',
    },
    devValue: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12,
      color: colors.text,
    },
    teamCodeHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    driverSeatBlock: {
      gap: 8,
      marginTop: 8,
    },
    driverSeatTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    driverSeatHint: {
      color: colors.mutedText,
      fontSize: 13,
      marginTop: 4,
    },
    driverSeatMetaRow: {
      flexDirection: isWeb ? 'row' : 'column',
      gap: 12,
      marginTop: 12,
    },
    driverSeatMeta: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: colors.surface,
    },
    driverSeatMetaLabel: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.mutedText,
    },
    driverSeatMetaValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginTop: 4,
    },
    driverSeatSuccess: {
      color: colors.success,
      fontSize: 12,
      fontWeight: '600',
    },
    driverSeatActions: {
      flexDirection: isWeb ? 'row' : 'column',
      gap: 8,
    },
    driverSeatButton: {
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
      flex: isWeb ? 1 : undefined,
    },
    driverSeatButtonPressed: {
      opacity: 0.9,
    },
    driverSeatButtonDisabled: {
      opacity: 0.7,
    },
    driverSeatButtonText: {
      color: colors.surface,
      fontWeight: '600',
    },
    driverSeatSecondaryButton: {
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flex: isWeb ? 1 : undefined,
    },
    driverSeatSecondaryText: {
      color: colors.text,
      fontWeight: '600',
    },
    teamCodeInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      color: colors.text,
      fontWeight: '600',
      letterSpacing: 1,
    },
    devInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      color: colors.text,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    teamCodeButton: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    devButton: {
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    devButtonDisabled: {
      opacity: 0.7,
    },
    teamCodeButtonPressed: {
      opacity: 0.9,
    },
    teamCodeButtonDisabled: {
      opacity: 0.7,
    },
    teamCodeButtonText: {
      color: colors.surface,
      fontWeight: '600',
    },
    devButtonText: {
      color: colors.surface,
      fontWeight: '600',
    },
    devStatusSuccess: {
      color: colors.success,
      fontWeight: '600',
      fontSize: 12,
    },
    devStatusError: {
      color: colors.danger,
      fontWeight: '600',
      fontSize: 12,
    },
    teamCodeSuccess: {
      color: colors.success,
      fontWeight: '600',
      fontSize: 12,
    },
    menuItem: {
      borderRadius: 12,
      backgroundColor: colors.surface,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
      alignSelf: isWeb ? 'flex-start' : 'stretch',
      width: isWeb ? constrainedWidth : '100%',
    },
    menuItemPressed: {
      opacity: 0.85,
    },
    menuItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    menuItemColumn: {
      gap: 4,
    },
    menuItemText: {
      color: colors.text,
      fontWeight: '600',
    },
    menuItemHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    destructiveItem: {
      borderRadius: 12,
      backgroundColor: colors.dangerMuted,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.danger,
      gap: 6,
      alignSelf: isWeb ? 'flex-start' : 'stretch',
      width: isWeb ? constrainedWidth : '100%',
    },
    destructiveItemPressed: {
      opacity: 0.9,
    },
    destructiveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    destructiveItemText: {
      color: colors.danger,
      fontWeight: '600',
    },
    destructiveHint: {
      color: colors.danger,
      fontSize: 12,
    },
    legalFooter: {
      gap: 4,
      paddingTop: 8,
      alignSelf: isWeb ? 'flex-start' : 'stretch',
      width: isWeb ? constrainedWidth : '100%',
    },
    legalFooterText: {
      color: colors.mutedText,
      fontSize: 12,
    },
    legalFooterLink: {
      color: colors.primary,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    legalOwnerText: {
      color: colors.mutedText,
      fontSize: 12,
    },
    sheetGroup: {
      gap: 16,
      alignSelf: isWeb ? 'flex-start' : 'stretch',
      width: isWeb ? constrainedWidth : '100%',
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    sheetHint: {
      color: colors.mutedText,
    },
    loaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    loaderText: {
      color: colors.mutedText,
    },
    formField: {
      gap: 8,
    },
    formLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    formInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    formActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    secondaryButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
    },
    secondaryButtonPressed: {
      opacity: 0.85,
    },
    secondaryButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    primaryButton: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
    },
    primaryButtonPressed: {
      opacity: 0.9,
    },
    primaryButtonText: {
      color: colors.surface,
      fontWeight: '600',
    },
    errorText: {
      color: colors.danger,
    },
  });
}

