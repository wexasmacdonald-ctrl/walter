import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminCreateUserCard } from '@/features/auth/AdminCreateUserCard';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { useAuth } from '@/features/auth/auth-context';
import { AdminDriverManager } from '@/features/admin/AdminDriverManager';
import { AdminDriverDetail } from '@/features/admin/AdminDriverDetail';
import { AdminTeamList } from '@/features/admin/AdminTeamList';
import { DevWorkspaceDirectory } from '@/features/admin/DevWorkspaceDirectory';
import { DevImpersonationPanel } from '@/features/admin/DevImpersonationPanel';
import { DevDriverAssignmentPanel } from '@/features/admin/DevDriverAssignmentPanel';
import { WorkspaceInviteShareCard } from '@/features/admin/WorkspaceInviteShareCard';
import { DriverStopsPanel } from '@/features/driver/DriverStopsPanel';
import type { UserRole } from '@/features/auth/types';
import { SettingsMenu } from '@/components/SettingsMenu';
import { useTheme } from '@/features/theme/theme-context';
import { AppHeader } from '@/components/AppHeader';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const IS_WEB = Platform.OS === 'web';
const REFRESH_COLORS = ['#1d4ed8', '#3b82f6'];
const REFRESH_OFFSET = Platform.select({ ios: 64, android: 0 }) ?? 0;

const createRefreshControl = (refreshing: boolean, onRefresh: () => void | Promise<void>) => (
  <RefreshControl
    refreshing={refreshing}
    onRefresh={onRefresh}
    tintColor="#2563eb"
    colors={REFRESH_COLORS}
    progressBackgroundColor="#e0f2fe"
    progressViewOffset={REFRESH_OFFSET}
  />
);

const isAdminRole = (role?: UserRole | null) => role === 'admin' || role === 'dev';

// Make all text selectable so users can copy content anywhere in the app.
if (!Text.defaultProps) {
  Text.defaultProps = {};
}
Text.defaultProps.selectable = true;

function PinPlannerApp() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <PlannerScreen />;
}

export default function PinPlannerRoot() {
  return <PinPlannerApp />;
}

function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      style={[styles.safeArea, styles.loadingScreen, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <AppHeader />
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>Loading…</Text>
      </View>
    </SafeAreaView>
  );
}

type PlannerProps = {
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  refreshSignal: number;
  onRefreshSignal?: () => void;
};

type PlannerContainerProps = {
  children: ReactNode;
  headerRight?: ReactNode;
};

function PlannerContainer({ children, headerRight }: PlannerContainerProps) {
  const { colors } = useTheme();
  return (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoiding, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
        edges={['top', 'left', 'right']}
      >
        <AppHeader rightSlot={headerRight} />
        {children}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function PlannerScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const bumpRefreshSignal = useCallback(() => {
    setRefreshSignal((prev) => prev + 1);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    bumpRefreshSignal();
    try {
      await delay(600);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, bumpRefreshSignal]);

  if (!user) {
    return null;
  }
  if (isAdminRole(user.role)) {
    return (
      <AdminPlanner
        refreshing={refreshing}
        onRefresh={handleRefresh}
        refreshSignal={refreshSignal}
        onRefreshSignal={bumpRefreshSignal}
      />
    );
  }
  return (
    <DriverPlanner
      refreshing={refreshing}
      onRefresh={handleRefresh}
      refreshSignal={refreshSignal}
      onRefreshSignal={bumpRefreshSignal}
    />
  );
}

function AdminPlanner({ refreshing, onRefresh, refreshSignal, onRefreshSignal }: PlannerProps) {
  const {
    user,
    workspaceId,
    signOut,
    deleteAccount,
    changePassword,
    getProfile,
    updateProfile,
    verifyPassword,
    applyTeamAccessCode,
  } = useAuth();
  const { colors } = useTheme();
  const [activeDriverId, setActiveDriverId] = useState<string | null>(null);
  const [showCreateUserCard, setShowCreateUserCard] = useState(false);
  const [devView, setDevView] = useState<'operations' | 'workspaces'>('operations');
  const isDevUser = user?.role === 'dev';
  const hasWorkspaceContext = !isDevUser || Boolean(workspaceId);

  const handleCloseDriverEditor = () => setActiveDriverId(null);
  const handleUserCreated = useCallback(
    (role: UserRole) => {
      if (role === 'admin') {
        onRefreshSignal?.();
      }
    },
    [onRefreshSignal]
  );

  const showWorkspaceDirectory = isDevUser && devView === 'workspaces' && !activeDriverId;

  const menuTrigger = (
    <SettingsMenu
      userName={user?.fullName}
      userRole={user?.role ?? 'admin'}
      businessTier={user?.businessTier ?? 'free'}
      businessName={user?.businessName ?? null}
      onDeleteAccount={deleteAccount}
      onSignOut={signOut}
      onChangePassword={changePassword}
      onGetProfile={getProfile}
      onUpdateProfile={updateProfile}
      onVerifyPassword={verifyPassword}
      onApplyTeamAccessCode={applyTeamAccessCode}
    />
  );

  return (
    <PlannerContainer headerRight={menuTrigger}>
      <View style={styles.plannerContent}>
        {isDevUser && !activeDriverId ? (
          <View
            style={[
              styles.block,
              styles.devToggleWrapper,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => setDevView('operations')}
              style={({ pressed }) => [
                styles.devToggleButton,
                devView === 'operations' && { backgroundColor: colors.primary },
                pressed && styles.devToggleButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.devToggleButtonText,
                  { color: devView === 'operations' ? colors.surface : colors.text },
                ]}
              >
                Driver ops
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDevView('workspaces')}
              style={({ pressed }) => [
                styles.devToggleButton,
                devView === 'workspaces' && { backgroundColor: colors.primary },
                pressed && styles.devToggleButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.devToggleButtonText,
                  { color: devView === 'workspaces' ? colors.surface : colors.text },
                ]}
              >
                Workspaces
              </Text>
            </Pressable>
          </View>
        ) : null}
        {showWorkspaceDirectory ? (
          <DevWorkspaceDirectory onOpenWorkspace={() => setDevView('operations')} />
        ) : activeDriverId ? (
          <AdminDriverDetail
            driverId={activeDriverId}
            onClose={handleCloseDriverEditor}
            refreshSignal={refreshSignal}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        ) : (
          <ScrollView
            style={[styles.screen, { backgroundColor: colors.background }]}
            contentContainerStyle={[
              styles.container,
              IS_WEB && styles.containerDesktop,
              { backgroundColor: colors.background },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustKeyboardInsets
            refreshControl={createRefreshControl(refreshing, onRefresh)}
          >
            <View style={styles.block}>
              <View style={styles.headerInfo}>
                <Text style={[styles.headerGreeting, { color: colors.text }]}>
                  {user?.fullName ? `Welcome, ${user.fullName}` : 'Welcome back'}
                </Text>
                <Text style={[styles.headerRole, { color: colors.mutedText }]}>
                  Signed in as{' '}
                  <Text style={[styles.headerRoleHighlight, { color: colors.primary }]}>
                    {user.role}
                  </Text>
                </Text>
                <Text style={[styles.headerRole, { color: colors.mutedText }]}>
                  Plan{' '}
                  <Text style={[styles.headerRoleHighlight, { color: colors.primary }]}>
                    {user?.businessTier === 'business' ? 'business tier' : 'free tier'}
                  </Text>
                </Text>
              </View>
            </View>

            {isDevUser ? (
              <>
                <View style={styles.block}>
                  <DevImpersonationPanel refreshSignal={refreshSignal} />
                </View>
                <View style={styles.block}>
                  <DevDriverAssignmentPanel
                    refreshSignal={refreshSignal}
                    onAssigned={onRefreshSignal}
                    onOpenWorkspaceDirectory={() => setDevView('workspaces')}
                  />
                </View>
              </>
            ) : (
              <View style={styles.block}>
                <WorkspaceInviteShareCard />
              </View>
            )}
            {isDevUser && !hasWorkspaceContext ? (
              <View style={styles.block}>
                <View style={[styles.instructions, { borderColor: colors.border }]}>
                  <Text style={[styles.instructionsTitle, { color: colors.text }]}>
                    Select a workspace
                  </Text>
                  <Text style={[styles.instructionsBody, { color: colors.mutedText }]}>
                    Use the Workspaces tab above to pick or create a company before managing drivers
                    and admins.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.block}>
                  <Pressable
                    accessibilityRole='button'
                    onPress={() => setShowCreateUserCard((prev) => !prev)}
                    style={({ pressed }) => [
                      styles.toggleButton,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      pressed && styles.toggleButtonPressed,
                      showCreateUserCard && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.toggleButtonText,
                        { color: colors.text },
                        showCreateUserCard && { color: colors.surface },
                      ]}
                    >
                      {showCreateUserCard ? 'Hide login form' : 'Create login'}
                    </Text>
                  </Pressable>
                  {showCreateUserCard ? (
                    <View style={styles.blockSpacing}>
                      <AdminCreateUserCard onUserCreated={handleUserCreated} />
                    </View>
                  ) : null}
                </View>

                {isDevUser ? (
                  <View style={styles.block}>
                    <AdminTeamList refreshSignal={refreshSignal} />
                  </View>
                ) : null}

                <View style={styles.block}>
                  <AdminDriverManager
                    onSelectDriver={setActiveDriverId}
                    refreshSignal={refreshSignal}
                  />
                </View>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </PlannerContainer>
  );
}

function DriverPlanner({ refreshing, onRefresh, refreshSignal }: PlannerProps) {
  const {
    user,
    signOut,
    deleteAccount,
    changePassword,
    getProfile,
    updateProfile,
    verifyPassword,
    applyTeamAccessCode,
  } = useAuth();
  const { colors } = useTheme();

  const menuTrigger = (
    <SettingsMenu
      userName={user?.fullName}
      userRole={user?.role ?? 'driver'}
      businessTier={user?.businessTier ?? 'free'}
      businessName={user?.businessName ?? null}
      onDeleteAccount={deleteAccount}
      onSignOut={signOut}
      onChangePassword={changePassword}
      onGetProfile={getProfile}
      onUpdateProfile={updateProfile}
      onVerifyPassword={verifyPassword}
      onApplyTeamAccessCode={applyTeamAccessCode}
    />
  );

  return (
    <PlannerContainer headerRight={menuTrigger}>
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        refreshControl={createRefreshControl(refreshing, onRefresh)}
      >
        <View style={styles.headerInfo}>
          <Text style={[styles.headerGreeting, { color: colors.text }]}>
            {user?.fullName ? `Welcome, ${user.fullName}` : 'Welcome back'}
          </Text>
          <Text style={[styles.headerRole, { color: colors.mutedText }]}>
            Signed in as{' '}
            <Text style={[styles.headerRoleHighlight, { color: colors.primary }]}>
              {user?.role}
            </Text>
          </Text>
          <Text style={[styles.headerRole, { color: colors.mutedText }]}>
            Plan{' '}
            <Text style={[styles.headerRoleHighlight, { color: colors.primary }]}>
              {user?.businessTier === 'business' ? 'business tier' : 'free tier'}
            </Text>
          </Text>
        </View>

        <DriverStopsPanel refreshSignal={refreshSignal} />
      </ScrollView>
    </PlannerContainer>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  plannerContent: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 112,
    gap: 24,
    alignItems: 'stretch',
  },
  containerDesktop: {
    alignItems: 'flex-start',
  },
  block: {
    width: '100%',
    alignSelf: Platform.OS === 'web' ? 'flex-start' : 'stretch',
    maxWidth: Platform.OS === 'web' ? 960 : undefined,
  },
  blockSpacing: {
    marginTop: 16,
  },
  toggleButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonPressed: {
    opacity: 0.9,
  },
  toggleButtonText: {
    fontWeight: '600',
  },
  devToggleWrapper: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  devToggleButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devToggleButtonPressed: {
    opacity: 0.9,
  },
  devToggleButtonText: {
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: '600',
  },
  headerRole: {
  },
  headerRoleHighlight: {
    fontWeight: '600',
  },
  instructions: {
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  instructionsBody: {
    lineHeight: 20,
  },
  summary: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  summaryText: {
  },
});
