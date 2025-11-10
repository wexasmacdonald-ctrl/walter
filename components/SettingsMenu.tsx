import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/features/theme/theme-context';
import { openPrivacyPolicy, openTermsOfUse } from '@/features/legal/legal-documents';

type SettingsMenuProps = {
  userName: string | null | undefined;
  userRole: string;
  onDeleteAccount: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onGetProfile: () => Promise<{ fullName: string | null; emailOrPhone: string | null }>;
  onUpdateProfile: (profile: {
    fullName?: string | null;
    emailOrPhone?: string;
  }) => Promise<{ fullName: string | null; emailOrPhone: string | null }>;
  onVerifyPassword: (password: string) => Promise<void>;
  onAfterDeleteAccount?: () => void | Promise<void>;
};

type ProcessingAction = null | 'account' | 'profile' | 'password';
type MenuView = 'main' | 'profile' | 'password';

export function SettingsMenu({
  userName,
  userRole,
  onDeleteAccount,
  onSignOut,
  onChangePassword,
  onGetProfile,
  onUpdateProfile,
  onVerifyPassword,
  onAfterDeleteAccount,
}: SettingsMenuProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<MenuView>('main');
  const [processing, setProcessing] = useState<ProcessingAction>(null);

  const [profileName, setProfileName] = useState('');
  const [profileContact, setProfileContact] = useState('');
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

  useEffect(() => {
    if (!visible) {
      resetState();
    }
  }, [visible]);

  const resetState = () => {
    setView('main');
    setProcessing(null);
    setProfileError(null);
    setPasswordError(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setConfirmPasswordInput('');
    setConfirmPasswordError(null);
    setConfirmProcessing(false);
  };

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
      const payload: { fullName?: string | null; emailOrPhone?: string } = {};
      payload.fullName = profileName.trim() === '' ? null : profileName.trim();
      payload.emailOrPhone = contact;

      const updated = await onUpdateProfile(payload);
      setProfileName(updated.fullName ?? '');
      setProfileContact(updated.emailOrPhone ?? '');
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

  const renderMainView = () => (
    <>
      <View style={styles.profileCard}>
        <Text style={styles.profileName}>{userName ? userName : 'Signed user'}</Text>
        <Text style={styles.profileRole}>{userRole}</Text>
      </View>

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
        <Text style={styles.legalOwnerText}>MacDonald AI controls and operates the App.</Text>
      </View>
    </>
  );

  const renderProfileView = () => (
    <View style={styles.sheetGroup}>
      <Text style={styles.sheetTitle}>Account details</Text>
      <Text style={styles.sheetHint}>
        Update the name and contact info associated with this account.
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

  return (
    <>
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
      <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={handleCloseMenu}>
        <SafeAreaView
          style={[styles.modalSafeArea, { backgroundColor: colors.background }]}
          edges={['left', 'right', 'bottom']}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={view === 'main' ? 'Close menu' : 'Back'}
              onPress={view === 'main' ? handleCloseMenu : () => setView('main')}
              style={({ pressed }) => [styles.closeTrigger, pressed && styles.closeTriggerPressed]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <View style={styles.hamburger}>
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
              </View>
              <Text style={styles.closeTriggerLabel}>
                {view === 'main' ? 'Close' : 'Back'}
              </Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {view === 'main' ? 'Menu' : view === 'profile' ? 'Account details' : 'Change password'}
            </Text>
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
      padding: 4,
      borderRadius: 4,
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
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
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
    closeTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
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
  });
}
