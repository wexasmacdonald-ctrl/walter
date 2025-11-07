import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { ChangePasswordCard } from '@/features/auth/ChangePasswordCard';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { useAuth } from '@/features/auth/auth-context';
import { AdminDriverManager } from '@/features/admin/AdminDriverManager';
import { AdminDriverDetail } from '@/features/admin/AdminDriverDetail';
import { DriverStopsPanel } from '@/features/driver/DriverStopsPanel';
import { MapScreen } from '@/features/route-planner/MapScreen';
import { PinsForm } from '@/features/route-planner/PinsForm';
import type { Stop } from '@/features/route-planner/types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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

export default function PinPlannerRoot() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <PlannerScreen />;
}

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.loadingText}>Loading…</Text>
    </View>
  );
}

type PlannerProps = {
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  refreshSignal: number;
};

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
  const { user, signOut } = useAuth();
  const [pins, setPins] = useState<Stop[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [activeDriverId, setActiveDriverId] = useState<string | null>(null);

  const handleCloseDriverEditor = () => setActiveDriverId(null);

  return (
    <>
      {activeDriverId ? (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <AdminDriverDetail
            driverId={activeDriverId}
            onClose={handleCloseDriverEditor}
            refreshSignal={refreshSignal}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        </SafeAreaView>
      ) : (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <ScrollView
            style={styles.screen}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            refreshControl={createRefreshControl(refreshing, onRefresh)}
          >
            <View style={styles.header}>
              <View style={styles.headerInfo}>
                <Text style={styles.headerGreeting}>
                  {user?.fullName ? `Welcome, ${user.fullName}` : 'Welcome back'}
                </Text>
                <Text style={styles.headerRole}>
                  Signed in as <Text style={styles.headerRoleHighlight}>{user.role}</Text>
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutButtonPressed]}
                onPress={signOut}
              >
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>

            <AdminCreateUserCard />
            <AdminDriverManager
              onSelectDriver={setActiveDriverId}
              refreshSignal={refreshSignal}
            />

            <View style={styles.instructions}>
              <Text style={styles.instructionsTitle}>Drop pins from addresses</Text>
              <Text style={styles.instructionsBody}>
                Paste newline-delimited addresses, hit geocode, and share the map with your drivers.
                Geocoding is now locked behind login so only your team can access it.
              </Text>
            </View>

            <PinsForm pins={pins} onPinsChange={setPins} onLoadingChange={setLoadingPins} />
            <MapScreen pins={pins} loading={loadingPins} />

            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                {pins.length === 0
                  ? 'No pins yet. Paste a list of addresses to get started.'
                  : `Showing ${pins.length} pin${pins.length === 1 ? '' : 's'}.`}
              </Text>
            </View>

            <ChangePasswordCard />

            <StatusBar style="auto" />
          </ScrollView>
        </SafeAreaView>
      )}
    </>
  );
}

function DriverPlanner({ refreshing, onRefresh, refreshSignal }: PlannerProps) {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={createRefreshControl(refreshing, onRefresh)}
      >
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.headerGreeting}>
              {user?.fullName ? `Welcome, ${user.fullName}` : 'Welcome back'}
            </Text>
            <Text style={styles.headerRole}>
              Signed in as <Text style={styles.headerRoleHighlight}>{user?.role}</Text>
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutButtonPressed]}
            onPress={signOut}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <DriverStopsPanel refreshSignal={refreshSignal} />

        <ChangePasswordCard />
        <StatusBar style="auto" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 112,
    gap: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    gap: 16,
  },
  loadingText: {
    color: '#e2e8f0',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: '600',
    color: '#0f172a',
  },
  headerRole: {
    color: '#475569',
  },
  headerRoleHighlight: {
    color: '#2563eb',
    fontWeight: '600',
  },
  signOutButton: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#1e40af',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1d4ed8',
  },
  signOutButtonPressed: {
    opacity: 0.9,
  },
  signOutText: {
    color: '#fff',
    fontWeight: '600',
  },
  instructions: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e40af',
  },
  instructionsBody: {
    color: '#3730a3',
    lineHeight: 20,
  },
  summary: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#eef2ff',
  },
  summaryText: {
    color: '#312e81',
  },
});
