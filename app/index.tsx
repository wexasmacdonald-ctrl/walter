import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { DriverStopsPanel } from '@/features/driver/DriverStopsPanel';
import { MapScreen } from '@/features/route-planner/MapScreen';
import { PinsForm } from '@/features/route-planner/PinsForm';
import type { Stop } from '@/features/route-planner/types';
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
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaView
      style={[styles.safeArea, styles.loadingScreen, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
};

type PlannerContainerProps = {
  children: ReactNode;
  headerRight?: ReactNode;
};

function PlannerContainer({ children, headerRight }: PlannerContainerProps) {
  const { colors, isDark } = useTheme();
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
        <StatusBar style={isDark ? 'light' : 'dark'} />
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

  const handleRefresh = useCallback(async () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    setRefreshSignal((prev) => prev + 1);
    try {
      await delay(600);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  if (!user) {
    return null;
  }
  if (user.role === 'admin') {
    return (
      <AdminPlanner
        refreshing={refreshing}
        onRefresh={handleRefresh}
        refreshSignal={refreshSignal}
      />
    );
  }
  return (
    <DriverPlanner
      refreshing={refreshing}
      onRefresh={handleRefresh}
      refreshSignal={refreshSignal}
    />
  );
}

function AdminPlanner({ refreshing, onRefresh, refreshSignal }: PlannerProps) {
  const {
    user,
    signOut,
    deleteAccount,
    changePassword,
    getProfile,
    updateProfile,
    verifyPassword,
  } = useAuth();
  const { colors } = useTheme();
  const [pins, setPins] = useState<Stop[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [activeDriverId, setActiveDriverId] = useState<string | null>(null);

  const handleCloseDriverEditor = () => setActiveDriverId(null);

  const menuTrigger = (
    <SettingsMenu
      userName={user?.fullName}
      userRole={user?.role ?? 'admin'}
      onDeleteAccount={deleteAccount}
      onSignOut={signOut}
      onChangePassword={changePassword}
      onGetProfile={getProfile}
      onUpdateProfile={updateProfile}
      onVerifyPassword={verifyPassword}
    />
  );

  return (
    <PlannerContainer headerRight={menuTrigger}>
      {activeDriverId ? (
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
            </View>
          </View>

          <View style={styles.block}>
            <AdminCreateUserCard />
          </View>

          <View style={styles.block}>
            <AdminDriverManager
              onSelectDriver={setActiveDriverId}
              refreshSignal={refreshSignal}
            />
          </View>

          <View style={styles.block}>
            <View
              style={[
                styles.instructions,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.instructionsTitle, { color: colors.text }]}>
                Drop pins from addresses
              </Text>
              <Text style={[styles.instructionsBody, { color: colors.mutedText }]}>
                Paste newline-delimited addresses, hit geocode, and share the map with your drivers.
                Geocoding is now locked behind login so only your team can access it.
              </Text>
            </View>
          </View>

          <View style={styles.block}>
            <PinsForm pins={pins} onPinsChange={setPins} onLoadingChange={setLoadingPins} />
          </View>

          <View style={styles.block}>
            <MapScreen pins={pins} loading={loadingPins} />
          </View>

          <View style={styles.block}>
            <View
              style={[
                styles.summary,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.summaryText, { color: colors.mutedText }]}>
                {pins.length === 0
                  ? 'No pins yet. Paste a list of addresses to get started.'
                  : `Showing ${pins.length} pin${pins.length === 1 ? '' : 's'}.`}
              </Text>
            </View>
          </View>

          <StatusBar style="auto" />
        </ScrollView>
      )}
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
  } = useAuth();
  const { colors } = useTheme();

  const menuTrigger = (
    <SettingsMenu
      userName={user?.fullName}
      userRole={user?.role ?? 'driver'}
      onDeleteAccount={deleteAccount}
      onSignOut={signOut}
      onChangePassword={changePassword}
      onGetProfile={getProfile}
      onUpdateProfile={updateProfile}
      onVerifyPassword={verifyPassword}
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
