import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { LoginScreen } from '@/features/auth/LoginScreen';
import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import { fetchOrgBillingStatus, type OrgBillingStatus } from '@/features/auth/api';
import { AdminDriverManager } from '@/features/admin/AdminDriverManager';
import { AdminDriverDetail } from '@/features/admin/AdminDriverDetail';
import { AdminTeamList } from '@/features/admin/AdminTeamList';
import { AdminAccessRequests } from '@/features/admin/AdminAccessRequests';
import { DevWorkspaceDirectory } from '@/features/admin/DevWorkspaceDirectory';
import { DevImpersonationPanel } from '@/features/admin/DevImpersonationPanel';
import { DevDriverAssignmentPanel } from '@/features/admin/DevDriverAssignmentPanel';
import { DriverStopsPanel } from '@/features/driver/DriverStopsPanel';
import type { UserRole, WorkspaceSummary } from '@/features/auth/types';
import { SettingsMenu } from '@/components/SettingsMenu';
import { useTheme } from '@/features/theme/theme-context';
import { AppHeader } from '@/components/AppHeader';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

const SHOW_DEV_TEST_SCREEN = false;

const FORCE_DEV_MINIMAL_UI = false;
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
const TextComponent = Text as typeof Text & { defaultProps?: { selectable?: boolean } };
if (!TextComponent.defaultProps) {
  TextComponent.defaultProps = {};
}
TextComponent.defaultProps.selectable = true;

function PinPlannerApp() {
  const { status, user } = useAuth();

  if (FORCE_DEV_MINIMAL_UI) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#eef2ff',
          padding: 16,
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <AppHeader />
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#1d4ed8' }}>DEV MINIMAL UI</Text>
        <Text style={{ color: '#475569' }}>
          If this screen renders, the JS bundle is running. Set FORCE_DEV_MINIMAL_UI to false to restore the full app.
        </Text>
      </SafeAreaView>
    );
  }

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <PlannerScreen />;
}

export default function PinPlannerRoot() {
  if (SHOW_DEV_TEST_SCREEN) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#eef2ff',
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#1d4ed8' }}>DEV TEST SCREEN</Text>
        <Text style={{ marginTop: 8, color: '#334155' }}>
          If you see this, routing/rendering is working. Toggle SHOW_DEV_TEST_SCREEN off after verifying.
        </Text>
      </SafeAreaView>
    );
  }
  return (
    <AppErrorBoundary>
      <PinPlannerApp />
    </AppErrorBoundary>
  );
}

type ErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends React.Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App error boundary caught', error);
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={[styles.safeArea, styles.loadingScreen]}>
          <AppHeader />
          <View style={[styles.loadingContainer]}>
            <Text style={[styles.loadingText]}>Something went wrong.</Text>
            <Text style={[styles.loadingText]}>{String(this.state.error.message)}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => this.setState({ error: null })}
              style={({ pressed }) => [
                styles.pillButton,
                { borderColor: '#000', backgroundColor: '#000' },
                pressed && styles.pillButtonPressed,
              ]}
            >
              <Text style={[styles.pillButtonText, { color: '#fff' }]}>Try again</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
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
        <Text style={[styles.loadingText, { color: colors.text }]}>Loading...</Text>
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

type AdminSectionKey =
  | 'overview'
  | 'workspaceAccess'
  | 'teamAccess'
  | 'driverDirectory'
  | 'devOps';

type AdminExperienceMode = 'home' | 'workspace' | 'directory';

type DriverSectionKey = 'driverPlan';

type SectionTone = 'neutral' | 'muted' | 'accent';

type SectionCardProps = {
  title: string;
  description?: string;
  badge?: string | null;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  tone?: SectionTone;
};

function SectionCard({
  title,
  description,
  badge,
  isOpen,
  onToggle,
  children,
  onLayout,
  tone = 'neutral',
}: SectionCardProps) {
  const { colors, isDark } = useTheme();
  const toneStyles =
    tone === 'accent'
      ? {
          backgroundColor: isDark ? '#111b2f' : '#e0f2fe',
          borderColor: isDark ? 'rgba(148, 163, 184, 0.35)' : '#93c5fd',
        }
      : tone === 'muted'
      ? {
          backgroundColor: isDark ? '#0d1828' : '#f4f4f7',
          borderColor: isDark ? colors.border : '#e2e8f0',
        }
      : {
          backgroundColor: isDark ? colors.surface : '#ffffff',
          borderColor: colors.border,
        };
  return (
    <View
      style={[
        styles.sectionCard,
        toneStyles,
        { shadowColor: colors.overlay },
      ]}
      onLayout={onLayout}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint={isOpen ? 'Collapse section' : 'Expand section'}
        onPress={onToggle}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.sectionHeaderPressed]}
      >
        <View style={styles.sectionHeaderText}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {description ? (
            <Text style={[styles.sectionDescription, { color: colors.mutedText }]}>{description}</Text>
          ) : null}
        </View>
        <View style={styles.sectionHeaderActions}>
          {badge ? (
            <View style={[styles.sectionBadge, { backgroundColor: colors.primaryMuted }]}>
              <Text style={[styles.sectionBadgeText, { color: colors.primary }]}>{badge}</Text>
            </View>
          ) : null}
          <Text style={[styles.sectionChevron, { color: colors.mutedText }]}>
            {isOpen ? '⌃' : '⌄'}
          </Text>
        </View>
      </Pressable>
      {isOpen ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

type CompanyShowcaseProps = {
  companies: WorkspaceSummary[];
  loading: boolean;
  error: string | null;
  allowCreate: boolean;
  activeWorkspaceId?: string | null;
  onOpen: (workspace: WorkspaceSummary) => void;
  onCreate?: () => void;
};

function CompanyShowcase({
  companies,
  loading,
  error,
  allowCreate,
  activeWorkspaceId,
  onOpen,
  onCreate,
}: CompanyShowcaseProps) {
  const { colors } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(activeWorkspaceId ?? null);
  const renderCardMeta = (company: WorkspaceSummary) => {
    if (!company.createdAt) {
      return 'Invite-ready';
    }
    const created = new Date(company.createdAt);
    if (Number.isNaN(created.getTime())) {
      return 'Invite-ready';
    }
    return `Launched ${created.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  };
  return (
    <View
      style={[
        styles.companyShowcase,
        { borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      <View style={styles.companyShowcaseHeader}>
        <View style={styles.headerInfo}>
          <Text style={[styles.companyShowcaseTitle, { color: colors.text }]}>
            Company accounts
          </Text>
          <Text style={[styles.companyShowcaseSubtitle, { color: colors.mutedText }]}>
            Tap any card to jump into that tenant operations cockpit.
          </Text>
        </View>
        <View style={styles.companyShowcaseActions}>{allowCreate && onCreate ? (
            <Pressable
              accessibilityRole="button"
              onPress={onCreate}
              style={({ pressed }) => [
                styles.pillButton,
                { borderColor: colors.primary, backgroundColor: colors.primary },
                pressed && styles.pillButtonPressed,
              ]}
            >
              <Text style={[styles.pillButtonText, { color: colors.surface }]}>
                New workspace
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {loading ? (
        <View style={styles.companyEmpty}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.mutedText }}>Loading your companies...</Text>
        </View>
      ) : error ? (
        <View style={styles.companyEmpty}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text></View>
      ) : companies.length === 0 ? (
        <View style={styles.companyEmpty}>
          <Text style={{ color: colors.mutedText }}>No companies yet. Create one to begin.</Text>
          {allowCreate && onCreate ? (
            <Pressable
              accessibilityRole="button"
              onPress={onCreate}
              style={({ pressed }) => [
                styles.companyCardButton,
                { borderColor: colors.primary, backgroundColor: colors.primary },
                pressed && styles.companyCardButtonPressed,
              ]}
            >
              <Text style={[styles.companyCardButtonText, { color: colors.surface }]}>
                Launch workspace
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.companyListCard}>
          {companies.map((company) => {
            const isExpanded = expandedId === company.id;
            return (
              <View
                key={company.id}
                style={[
                  styles.companyRow,
                  { borderColor: colors.border },
                  isExpanded && { backgroundColor: colors.surface },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setExpandedId((prev) => (prev === company.id ? null : company.id))}
                  style={({ pressed }) => [
                    styles.companyRowHeader,
                    pressed && styles.companyRowHeaderPressed,
                  ]}
                >
                  <View style={styles.companyRowInfo}>
                    <View
                      style={[
                        styles.companyCardIcon,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                    >
                      <Feather name="briefcase" size={18} color={colors.text} />
                    </View>
                    <View style={styles.companyRowText}>
                      <Text style={[styles.companyCardName, { color: colors.text }]}>
                        {company.name}
                      </Text>
                      <Text style={[styles.companyCardMeta, { color: colors.mutedText }]}>
                        {renderCardMeta(company)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.companyRowBadgeArea}>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.mutedText}
                    />
                  </View>
                </Pressable>
                {isExpanded ? (
                  <View style={styles.companyRowBody}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onOpen(company)}
                      style={({ pressed }) => [
                        styles.companyCardButton,
                        { borderColor: colors.primary, backgroundColor: colors.primary },
                        pressed && styles.companyCardButtonPressed,
                      ]}
                    >
                      <Text style={[styles.companyCardButtonText, { color: colors.surface }]}>
                        Enter account
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

type InfoBannerProps = {
  title: string;
  message: string;
  tone?: 'info' | 'success' | 'warning';
};

function InfoBanner({ title, message, tone = 'info' }: InfoBannerProps) {
  const { colors } = useTheme();
  const toneStyles =
    tone === 'success'
      ? { backgroundColor: colors.successMuted, color: colors.success }
      : tone === 'warning'
      ? { backgroundColor: colors.dangerMuted, color: colors.danger }
      : { backgroundColor: colors.primaryMuted, color: colors.primary };
  return (
    <View style={[styles.infoBanner, { backgroundColor: toneStyles.backgroundColor }]}>
      <Text style={[styles.infoBannerTitle, { color: toneStyles.color }]}>{title}</Text>
      <Text style={[styles.infoBannerMessage, { color: colors.mutedText }]}>{message}</Text>
    </View>
  );
}

function PlannerScreen() {
  const { user, status, refreshSession } = useAuth();
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
    try {
      await refreshSession();
    } catch (error) {
      console.warn('Session refresh failed', error);
    } finally {
      bumpRefreshSignal();
      await delay(600);
      setRefreshing(false);
    }
  }, [refreshing, refreshSession, bumpRefreshSignal]);

  if (!user) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.loadingScreen]}>
        <AppHeader />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>No user loaded (status {status})</Text>
        </View>
      </SafeAreaView>
    );
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
    token,
    workspaceId,
    workspaceName,
    selectWorkspace,
    signOut,
    deleteAccount,
    changePassword,
    getProfile,
    updateProfile,
    verifyPassword,
    applyTeamAccessCode,
    bootstrapWorkspace,
    attachWorkspace,
    syncDriverSeatLimit,
  } = useAuth();
  const { colors } = useTheme();
  const [activeDriverId, setActiveDriverId] = useState<string | null>(null);
  const [experienceMode, setExperienceMode] = useState<AdminExperienceMode>(() =>
    user?.role === 'dev' ? 'home' : 'workspace'
  );
  const [companyDirectory, setCompanyDirectory] = useState<WorkspaceSummary[]>([]);
  const [companyDirectoryLoading, setCompanyDirectoryLoading] = useState(false);
  const [companyDirectoryError, setCompanyDirectoryError] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<OrgBillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const isDevUser = user?.role === 'dev';
  const hasWorkspaceContext = Boolean(workspaceId);
  const autoSelectedWorkspace = useRef(false);
  const createCollapsedSections = useCallback(
    () =>
      ({
        overview: false,
        workspaceAccess: false,
        teamAccess: false,
        driverDirectory: false,
        devOps: false,
      }) as Record<AdminSectionKey, boolean>,
    []
  );
  const [openSections, setOpenSections] = useState<Record<AdminSectionKey, boolean>>(
    createCollapsedSections
  );
  const scrollRef = useRef<ScrollView | null>(null);
  const swipeTranslate = useRef(new Animated.Value(0)).current;
  const sectionPositions = useRef<Partial<Record<AdminSectionKey, number>>>({});
  const [experienceHistory, setExperienceHistory] = useState<AdminExperienceMode[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const previousModeRef = useRef<AdminExperienceMode | null>(null);

  useEffect(() => {
    if (!isDevUser) {
      setOpenSections((prev) => ({
        ...prev,
        devOps: false,
      }));
    }
  }, [isDevUser]);

  const loadBillingStatus = useCallback(async () => {
    if (!token || !workspaceId) {
      setBillingStatus(null);
      return;
    }
    setBillingLoading(true);
    setBillingError(null);
    try {
      const status = await fetchOrgBillingStatus(token, workspaceId ?? undefined);
      setBillingStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ORG_NOT_FOUND')) {
        setBillingStatus(null);
        setBillingError(null);
      } else {
        console.error('Failed to load billing status', error);
        setBillingStatus(null);
        setBillingError('Could not load billing status.');
      }
    } finally {
      setBillingLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    void (async () => {
      try {
        await loadBillingStatus();
      } catch {
        // handled in loadBillingStatus
      }
    })();
  }, [loadBillingStatus, refreshSignal]);

  useEffect(() => {
    if (!isDevUser) {
      setExperienceHistory([]);
      setExperienceMode('workspace');
    }
  }, [isDevUser]);

  useEffect(() => {
    if (experienceMode !== 'workspace') {
      setActiveDriverId(null);
    }
  }, [experienceMode]);

  useEffect(() => {
    swipeTranslate.setValue(0);
  }, [experienceMode, swipeTranslate]);

  const loadCompanyDirectory = useCallback(async () => {
    if (!token || !isDevUser) {
      return;
    }
    setCompanyDirectoryLoading(true);
    setCompanyDirectoryError(null);
    try {
      const list = await authApi.fetchDevWorkspaces(token);
      setCompanyDirectory(list);
    } catch (error) {
      setCompanyDirectoryError(
        getFriendlyError(error, {
          fallback: 'Unable to load company accounts right now. Pull down to retry.',
        })
      );
    } finally {
      setCompanyDirectoryLoading(false);
    }
  }, [token, isDevUser]);

  useEffect(() => {
    if (!isDevUser) {
      setCompanyDirectory([]);
      setCompanyDirectoryError(null);
      setCompanyDirectoryLoading(false);
      return;
    }
    void loadCompanyDirectory();
  }, [isDevUser, loadCompanyDirectory, refreshSignal]);

  useEffect(() => {
    if (isDevUser && !workspaceId && companyDirectory.length > 0) {
      const target = companyDirectory[0];
      void selectWorkspace(target.id, target.name);
    }
  }, [isDevUser, workspaceId, companyDirectory, selectWorkspace]);

  useEffect(() => {
    if (
      isDevUser &&
      !workspaceId &&
      !companyDirectoryLoading &&
      companyDirectory.length > 0 &&
      !autoSelectedWorkspace.current
    ) {
      const first = companyDirectory[0];
      autoSelectedWorkspace.current = true;
      void selectWorkspace(first.id, first.name);
    }
  }, [isDevUser, workspaceId, companyDirectory, companyDirectoryLoading, selectWorkspace]);

  const toggleSection = useCallback((key: AdminSectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const focusSection = useCallback(
    (key: AdminSectionKey, options?: { scroll?: boolean }) => {
      setOpenSections((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
      if (options?.scroll === false) {
        return;
      }
      const position = sectionPositions.current[key];
      if (scrollRef.current && typeof position === 'number') {
        scrollRef.current.scrollTo({ y: Math.max(position - 24, 0), animated: true });
      }
    },
    []
  );

  const handleCloseDriverEditor = useCallback(() => setActiveDriverId(null), []);

  const navigateToMode = useCallback(
    (nextMode: AdminExperienceMode, options?: { resetHistory?: boolean }) => {
      if (!isDevUser) {
        setExperienceHistory([]);
        setExperienceMode(nextMode);
        return;
      }
      setExperienceHistory((prevHistory) => {
        if (options?.resetHistory) {
          return [];
        }
        if (experienceMode !== nextMode) {
          return [...prevHistory, experienceMode];
        }
        return prevHistory;
      });
      setExperienceMode(nextMode);
    },
    [experienceMode, isDevUser]
  );

  const targetBackMode = isDevUser
    ? experienceHistory.length > 0
      ? experienceHistory[experienceHistory.length - 1]
      : experienceMode !== 'home'
      ? 'home'
      : null
    : null;

  const handleEnterWorkspace = useCallback(
    async (company?: WorkspaceSummary | null) => {
      if (isDevUser && company) {
        await selectWorkspace(company.id, company.name);
      }
      navigateToMode('workspace');
      setOpenSections(createCollapsedSections());
      setActiveDriverId(null);
    },
    [isDevUser, navigateToMode, selectWorkspace, createCollapsedSections]
  );

  const handleOpenDirectory = useCallback(() => {
    if (!isDevUser) {
      return;
    }
    navigateToMode('directory');
  }, [isDevUser, navigateToMode]);

  const handleSyncDriverSeats = useCallback(async () => {
    const result = await syncDriverSeatLimit();
    if (result.action !== 'checkout') {
      await loadBillingStatus();
    }
    return result;
  }, [syncDriverSeatLimit, loadBillingStatus]);

  const billingActive = billingStatus?.billingStatus === 'active';
  const canSkipBillingGate = isDevUser || (user?.role === 'admin' && billingStatus === null);

  const menuTrigger = (
    <SettingsMenu
      userName={user?.fullName}
      userRole={user?.role ?? 'admin'}
      businessTier={user?.businessTier ?? 'free'}
      businessName={user?.businessName ?? null}
      billingStatus={billingStatus}
      billingLoading={billingLoading}
      workspaceId={workspaceId}
      onBootstrapWorkspace={bootstrapWorkspace}
      onAttachWorkspace={attachWorkspace}
      onRefreshBillingStatus={loadBillingStatus}
      onSyncDriverSeats={handleSyncDriverSeats}
      onDeleteAccount={deleteAccount}
      onSignOut={signOut}
      onChangePassword={changePassword}
      onGetProfile={getProfile}
      onUpdateProfile={updateProfile}
      onVerifyPassword={verifyPassword}
      onApplyTeamAccessCode={applyTeamAccessCode}
    />
  );

  const workspaceDisplayName =
    workspaceName ??
    (workspaceId ? `Workspace ${workspaceId.slice(0, 8)}` : isDevUser ? 'Dev sandbox' : null);
  const homeCompanies: WorkspaceSummary[] = isDevUser
    ? companyDirectory
    : workspaceId && workspaceDisplayName
    ? [{ id: workspaceId, name: workspaceDisplayName }]
    : [];

  const canGoBack = isDevUser && (experienceMode !== 'home' || experienceHistory.length > 0);

  const resetSwipePosition = useCallback(() => {
    Animated.spring(swipeTranslate, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [swipeTranslate]);

  const animateBackNavigation = useCallback(
    (fromGesture = false) => {
      if (!canGoBack || !targetBackMode) {
        resetSwipePosition();
        return;
      }
      if (isTransitioning) {
        return;
      }
      setIsTransitioning(true);
      previousModeRef.current = targetBackMode;
      if (!fromGesture) {
        swipeTranslate.setValue(0);
      }
      Animated.timing(swipeTranslate, {
        toValue: screenWidth,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setExperienceHistory((prev) =>
          prev.length > 0 ? prev.slice(0, -1) : []
        );
        setExperienceMode(targetBackMode);
        if (targetBackMode !== 'workspace') {
          setActiveDriverId(null);
        }
        swipeTranslate.setValue(0);
        setIsTransitioning(false);
      });
    },
    [
      canGoBack,
      isTransitioning,
      resetSwipePosition,
      screenWidth,
      setExperienceHistory,
      setExperienceMode,
      swipeTranslate,
      targetBackMode,
    ]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (!canGoBack) {
            return false;
          }
          const { dx, dy } = gesture;
          if (dx <= 0) {
            return false;
          }
          return dx > 15 && Math.abs(dx) > Math.abs(dy);
        },
        onPanResponderMove: (_, gesture) => {
          if (!canGoBack) {
            return;
          }
          const offset = Math.min(gesture.dx, screenWidth);
          swipeTranslate.setValue(offset);
        },
        onPanResponderRelease: (_, gesture) => {
          if (!canGoBack) {
            resetSwipePosition();
            return;
          }
          if (gesture.dx > 80) {
            animateBackNavigation(true);
          } else {
            resetSwipePosition();
          }
        },
        onPanResponderTerminate: () => {
          resetSwipePosition();
        },
      }),
    [animateBackNavigation, canGoBack, resetSwipePosition, screenWidth, swipeTranslate]
  );
  const panHandlers = isDevUser ? panResponder.panHandlers : {};

  const sections: {
    key: AdminSectionKey;
    title: string;
    description?: string;
    badge?: string | null;
    visible: boolean;
    content: ReactNode;
  }[] = [
    {
      key: 'teamAccess' as const,
      title: 'Team roster & access',
      description: 'Promote trusted drivers to admin and review who can manage the workspace.',
      visible: true,
      content: (
        <View style={styles.sectionStack}>
          <InfoBanner
            title="Manage admin access"
            message="Promote drivers from the driver directory. Use this roster to audit admins or remove old teammates."
          />
          {hasWorkspaceContext ? (
            <View style={styles.sectionSpacer}>
              <AdminTeamList refreshSignal={refreshSignal} />
              <AdminAccessRequests refreshSignal={refreshSignal} />
            </View>
          ) : (
            <InfoBanner
              title="Workspace required"
              message="Pick a workspace to review and prune its admin roster."
              tone="warning"
            />
          )}
        </View>
      ),
    },
    {
      key: 'driverDirectory' as const,
      title: 'Driver directory',
      description: 'Assign drivers, edit profiles, or impersonate accounts.',
      visible: true,
      content: hasWorkspaceContext ? (
        <AdminDriverManager onSelectDriver={setActiveDriverId} refreshSignal={refreshSignal} />
      ) : (
        <InfoBanner
          title="Select a workspace first"
          message="Use the workspace directory to open a company before editing driver stop lists."
          tone="warning"
        />
      ),
    },
    {
      key: 'devOps' as const,
      title: 'Developer operations',
      description: 'Workspace selection, impersonation, and driver assignment tools.',
      visible: isDevUser,
      content: (
        <View style={styles.sectionStack}>
          <InfoBanner
            title="Developer toolkit"
            message="Use impersonation, driver assignment, and workspace directory tools to QA every path before release."
          />
          <DevImpersonationPanel refreshSignal={refreshSignal} />
          <DevDriverAssignmentPanel
            refreshSignal={refreshSignal}
            onAssigned={onRefreshSignal}
          />
          {!hasWorkspaceContext ? (
            <View style={[styles.instructions, { borderColor: colors.border }]}>
              <Text style={[styles.instructionsTitle, { color: colors.text }]}>
                Select a workspace
              </Text>
              <Text style={[styles.instructionsBody, { color: colors.mutedText }]}>
                Choose or create a workspace before assigning drivers or inviting admins.
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenDirectory}
            style={({ pressed }) => [
              styles.pillButton,
              { borderColor: colors.primary, backgroundColor: colors.primary },
              pressed && styles.pillButtonPressed,
            ]}
          >
            <Text style={[styles.pillButtonText, { color: colors.surface }]}>
              Open workspace directory
            </Text>
          </Pressable>
        </View>
      ),
    },
  ];

  const renderExperienceContent = (
    mode: AdminExperienceMode,
    options?: { preview?: boolean }
  ) => {
    const pointerEvents = options?.preview ? 'none' : 'auto';
    if (mode === 'home') {
      return (
        <View style={styles.plannerContent} pointerEvents={pointerEvents}>
          <ScrollView
            style={[styles.screen, { backgroundColor: colors.background }]}
            contentContainerStyle={[
              styles.container,
              IS_WEB && styles.containerDesktop,
              { backgroundColor: colors.background },
            ]}
            refreshControl={createRefreshControl(refreshing, onRefresh)}
          >
            <CompanyShowcase
              companies={homeCompanies}
              loading={companyDirectoryLoading}
              error={companyDirectoryError}
              allowCreate={isDevUser}
              activeWorkspaceId={workspaceId}
              onOpen={(company) => {
                void handleEnterWorkspace(company);
              }}
              onCreate={handleOpenDirectory}
            />
          </ScrollView>
        </View>
      );
    }
    if (mode === 'directory') {
      return (
        <View style={styles.plannerContent} pointerEvents={pointerEvents}>
          <View
            style={[
              styles.sectionToolbar,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <View style={styles.headerInfo}>
              <Text style={[styles.sectionToolbarTitle, { color: colors.text }]}>
                Workspace directory
              </Text>
              <Text style={[styles.sectionDescription, { color: colors.mutedText }]}>
                Audit, create, and switch company accounts in one view.
              </Text>
            </View>
          </View>
          <View style={styles.workspaceDirectoryWrapper}>
            <DevWorkspaceDirectory
              onOpenWorkspace={() => {
                void handleEnterWorkspace();
                focusSection('devOps');
              }}
            />
          </View>
        </View>
      );
    }
    return (
        <View style={styles.plannerContent} pointerEvents={pointerEvents}>
          {activeDriverId ? (
            <AdminDriverDetail
              driverId={activeDriverId}
              onClose={handleCloseDriverEditor}
              refreshSignal={refreshSignal}
              refreshing={refreshing}
              onRefresh={onRefresh}
              hasPaidWorkspace={billingActive}
            />
          ) : (
            <ScrollView
              ref={options?.preview ? undefined : scrollRef}
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
              {billingError ? (
                <InfoBanner
                  title="Billing status unavailable"
                  message={billingError}
                  tone="warning"
                />
              ) : null}
            {sections
              .filter((section) => section.visible)
              .map((section) => (
                <SectionCard
                  key={section.key}
                  title={section.title}
                  description={section.description}
                  badge={section.badge}
                  isOpen={openSections[section.key]}
                  onToggle={() => toggleSection(section.key)}
                  tone="neutral"
                  onLayout={
                    options?.preview
                      ? undefined
                      : (event) => {
                          sectionPositions.current[section.key] = event.nativeEvent.layout.y;
                        }
                  }
                >
                  {section.content}
                </SectionCard>
              ))}
          </ScrollView>
        )}
      </View>
    );
  };


  const previousMode =
    previousModeRef.current ??
    (isDevUser
      ? experienceHistory.length > 0
        ? experienceHistory[experienceHistory.length - 1]
        : experienceMode !== 'home'
        ? 'home'
        : null
      : null);
  const previousTranslate = useMemo(
    () =>
      swipeTranslate.interpolate({
        inputRange: [0, screenWidth],
        outputRange: [-40, 0],
        extrapolate: 'clamp',
      }),
    [screenWidth, swipeTranslate]
  );
  const previousOpacity = useMemo(
    () =>
      swipeTranslate.interpolate({
        inputRange: [0, screenWidth * 0.4],
        outputRange: [0, 0.35],
        extrapolate: 'clamp',
      }),
    [screenWidth, swipeTranslate]
  );

  let content: ReactNode;
  try {
    content = !billingActive && !billingLoading && !canSkipBillingGate ? (
      <SafeAreaView style={[styles.safeArea, styles.loadingScreen]}>
        <AppHeader rightSlot={menuTrigger} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Billing inactive.</Text>
          <Text style={[styles.loadingText, { marginTop: 8 }]}>
            Activate billing to create routes and manage drivers.
          </Text>
          {billingError ? (
            <Text style={[styles.loadingText, { color: colors.danger }]}>{billingError}</Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [
              styles.linkButton,
              { marginTop: 16, borderColor: colors.primary },
              pressed && styles.linkButtonPressed,
            ]}
            onPress={loadBillingStatus}
          >
            <Text style={[styles.linkButtonText, { color: colors.primary }]}>Refresh billing status</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    ) : (
      <PlannerContainer headerRight={menuTrigger}>
        <View style={styles.experienceStage}>
          {previousMode ? (
            <Animated.View
              style={[
                styles.previousStage,
                {
                  transform: [{ translateX: previousTranslate }],
                  opacity: previousOpacity,
                },
              ]}
              pointerEvents="none"
            >
              {renderExperienceContent(previousMode, { preview: true })}
            </Animated.View>
          ) : null}
          <Animated.View
            style={[
              styles.currentStage,
              {
                transform: [{ translateX: swipeTranslate }],
              },
            ]}
            {...(isDevUser ? panHandlers : {})}
          >
            {renderExperienceContent(experienceMode)}
          </Animated.View>
        </View>
      </PlannerContainer>
    );
  } catch (error) {
    console.error('AdminPlanner render error', error);
    content = (
      <SafeAreaView style={[styles.safeArea, styles.loadingScreen]}>
        <AppHeader />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Render error</Text>
          <Text style={styles.loadingText}>{String((error as Error).message ?? error)}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return content;
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
    createWorkspace,
    requestWorkspaceAccess,
  } = useAuth();
  const { colors } = useTheme();
  const [openSections, setOpenSections] = useState<Record<DriverSectionKey, boolean>>({
    driverPlan: false,
  });
  const [workspaceNameInput, setWorkspaceNameInput] = useState(user?.businessName ?? '');
  const [workspaceDriverSeats, setWorkspaceDriverSeats] = useState('1');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [accessAdminContact, setAccessAdminContact] = useState('');
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);

  const toggleSection = useCallback((key: DriverSectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const menuTrigger = (
    <SettingsMenu
      userName={user?.fullName}
      userRole={user?.role ?? 'driver'}
      businessTier={user?.businessTier ?? 'free'}
      businessName={user?.businessName ?? null}
      billingStatus={null}
      billingLoading={false}
      workspaceId={user?.workspaceId ?? null}
      onDeleteAccount={deleteAccount}
      onSignOut={signOut}
      onChangePassword={changePassword}
      onGetProfile={getProfile}
      onUpdateProfile={updateProfile}
      onVerifyPassword={verifyPassword}
      onApplyTeamAccessCode={applyTeamAccessCode}
    />
  );

  const canCreateWorkspace = user?.role === 'driver' && !user?.workspaceId;

  const handleRequestAccess = useCallback(async () => {
    if (requestingAccess) {
      return;
    }
    const trimmed = accessAdminContact.trim();
    if (!trimmed) {
      Alert.alert('Enter an admin contact', 'Type the email or phone number of a workspace admin.');
      return;
    }
    setRequestingAccess(true);
    setAccessMessage(null);
    try {
      const result = await requestWorkspaceAccess(trimmed);
      if (result.status === 'already_member') {
        setAccessMessage('You are already in this workspace.');
      } else {
        setAccessMessage('Request sent to the workspace admins.');
      }
    } catch (error) {
      Alert.alert(
        'Request not sent',
        getFriendlyError(error, {
          fallback: 'Could not send the access request. Double-check the admin contact and try again.',
        })
      );
    } finally {
      setRequestingAccess(false);
    }
  }, [accessAdminContact, requestWorkspaceAccess, requestingAccess]);

  const handleCreateWorkspace = useCallback(async () => {
    if (creatingWorkspace) {
      return;
    }
    const trimmed = workspaceNameInput.trim();
    if (!trimmed) {
      Alert.alert('Add a workspace name', 'Give your workspace a short name to set it up.');
      return;
    }
    const seatValue = Number(workspaceDriverSeats.trim());
    if (!Number.isFinite(seatValue) || seatValue < 1) {
      Alert.alert('Enter driver seats', 'Specify how many drivers you plan to manage.');
      return;
    }
    const seatCount = Math.max(1, Math.floor(seatValue));
    setCreatingWorkspace(true);
    try {
      const workspace = await createWorkspace({ name: trimmed, numberOfDrivers: seatCount });
      setWorkspaceNameInput(workspace.name);
      setWorkspaceDriverSeats(String(seatCount));
      Alert.alert('Workspace created', `${workspace.name} is live on the free tier.`);
    } catch (error) {
      Alert.alert(
        'Workspace not created',
        getFriendlyError(error, { fallback: 'Could not create your workspace. Try again.' })
      );
    } finally {
      setCreatingWorkspace(false);
    }
  }, [createWorkspace, creatingWorkspace, workspaceDriverSeats, workspaceNameInput]);

  const sections: {
    key: DriverSectionKey;
    title: string;
    description?: string;
    badge?: string | null;
    visible: boolean;
    content: ReactNode;
  }[] = [
    {
      key: 'driverPlan' as const,
      title: 'Assignments & stops',
      description: "Review today's manifest. Dispatch manages edits for you.",
      visible: true,
      content: <DriverStopsPanel refreshSignal={refreshSignal} />,
    },
  ];

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
        {!user?.workspaceId ? (
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: colors.overlay,
              },
            ]}
          >
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Request access to a company</Text>
              <Text style={[styles.sectionDescription, { color: colors.mutedText }]}>
                Enter the email or phone number of an admin at the company. We will notify their admin inbox to approve
                your access.
              </Text>
            </View>
            <View style={styles.workspaceForm}>
              <TextInput
                value={accessAdminContact}
                onChangeText={setAccessAdminContact}
                placeholder="admin@example.com or phone"
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    color: colors.text,
                  },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!requestingAccess}
              />
              <Pressable
                accessibilityRole="button"
                onPress={handleRequestAccess}
                disabled={requestingAccess}
                style={({ pressed }) => [
                  styles.pillButton,
                  { borderColor: colors.primary, backgroundColor: colors.primary },
                  (pressed || requestingAccess) && styles.pillButtonPressed,
                ]}
              >
                <Text style={[styles.pillButtonText, { color: colors.surface }]}>
                  {requestingAccess ? 'Sending request...' : 'Request access'}
                </Text>
              </Pressable>
              {accessMessage ? (
                <Text style={[styles.sectionDescription, { color: colors.mutedText }]}>{accessMessage}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
        {canCreateWorkspace ? (
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: colors.overlay,
              },
            ]}
          >
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Create your workspace</Text>
              <Text style={[styles.sectionDescription, { color: colors.mutedText }]}>
                Launch a free-tier workspace and upgrade later when you are ready to scale.
              </Text>
            </View>
            <View style={styles.workspaceForm}>
              <TextInput
                value={workspaceNameInput}
                onChangeText={setWorkspaceNameInput}
                placeholder="Workspace name"
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    color: colors.text,
                  },
                ]}
                autoCapitalize="words"
                autoCorrect
                editable={!creatingWorkspace}
              />
              <TextInput
                value={workspaceDriverSeats}
                onChangeText={(value) => setWorkspaceDriverSeats(value.replace(/[^0-9]/g, ''))}
                placeholder="Driver seats (e.g. 5)"
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    color: colors.text,
                  },
                ]}
                keyboardType="number-pad"
                inputMode="numeric"
                editable={!creatingWorkspace}
              />
              <Pressable
                accessibilityRole="button"
                onPress={handleCreateWorkspace}
                disabled={creatingWorkspace}
                style={({ pressed }) => [
                  styles.pillButton,
                  { borderColor: colors.primary, backgroundColor: colors.primary },
                  (pressed || creatingWorkspace) && styles.pillButtonPressed,
                ]}
              >
                <Text style={[styles.pillButtonText, { color: colors.surface }]}>
                  {creatingWorkspace ? 'Creating workspace...' : 'Create workspace free'}
                </Text>
              </Pressable>
              <Text style={[styles.sectionDescription, { color: colors.mutedText }]}>
                Free trial tier by default. Invite admins and drivers once you are set up.
              </Text>
            </View>
          </View>
        ) : null}
        {sections.map((section) => (
          <SectionCard
            key={section.key}
            title={section.title}
            description={section.description}
            badge={section.badge}
            isOpen={openSections[section.key]}
            onToggle={() => toggleSection(section.key)}
            tone="neutral"
          >
            {section.content}
          </SectionCard>
        ))}
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
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 64,
    gap: 20,
    alignItems: 'stretch',
    flexGrow: 1,
  },
  containerDesktop: {
    alignItems: 'flex-start',
  },
  workspaceForm: {
    gap: 12,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 15,
  },
  experienceStage: {
    flex: 1,
    overflow: 'hidden',
  },
  previousStage: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ translateX: -40 }],
    opacity: 0,
  },
  currentStage: {
    flex: 1,
  },
  marketingContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 64,
    gap: 20,
    flexGrow: 1,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: Platform.OS === 'web' ? 0 : 0.08,
    shadowRadius: 24,
    elevation: 2,
  },
  heroKicker: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  highlightStack: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
    gap: 2,
  },
  featureFooter: {
    marginTop: 4,
  },
  highlightTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  highlightCopy: {
    fontSize: 13,
    lineHeight: 18,
  },
  heroButton: {
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: Platform.OS === 'web' ? 0 : 0.08,
    shadowRadius: 16,
  },
  heroButtonLabel: {
    fontWeight: '700',
    fontSize: 15,
  },
  sectionCard: {
    width: '100%',
    alignSelf: Platform.OS === 'web' ? 'flex-start' : 'stretch',
    maxWidth: Platform.OS === 'web' ? 960 : undefined,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: Platform.OS === 'web' ? 0 : 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  sectionHeaderPressed: {
    opacity: 0.9,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionChevron: {
    fontSize: 18,
    fontWeight: '700',
    paddingLeft: 8,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  sectionBadgeText: {
    fontWeight: '600',
    fontSize: 12,
  },
  sectionBody: {
    gap: 16,
  },
  sectionStack: {
    gap: 16,
  },
  sectionSpacer: {
    marginTop: 4,
  },
  sectionNote: {
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    flexGrow: 1,
    flexBasis: Platform.OS === 'web' ? '31%' : '48%',
    minWidth: 160,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Platform.OS === 'web' ? 0 : 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  quickActionCardPressed: {
    transform: [{ translateY: 1 }],
  },
  quickActionCardDisabled: {
    opacity: 0.5,
  },
  quickActionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionTitle: {
    fontWeight: '600',
    fontSize: 15,
  },
  quickActionDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoBanner: {
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  infoBannerTitle: {
    fontWeight: '600',
  },
  infoBannerMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  pillButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillButtonPressed: {
    opacity: 0.9,
  },
  pillButtonText: {
    fontWeight: '600',
  },
  sectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionToolbarTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  workspaceDirectoryWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  errorText: {
    fontSize: 14,
    fontWeight: '600',
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
  summaryHint: {
    marginTop: 8,
    fontSize: 13,
  },
  companyShowcase: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  companyShowcaseHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 12,
  },
  companyShowcaseTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  companyShowcaseSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  companyShowcaseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  linkButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  linkButtonPressed: {
    opacity: 0.85,
  },
  linkButtonText: {
    fontWeight: '600',
    fontSize: 12,
  },
  companyEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  companyListCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  companyRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  companyRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  companyRowHeaderPressed: {
    opacity: 0.9,
  },
  companyRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  companyRowText: {
    flex: 1,
  },
  companyRowBadgeArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  companyRowBody: {
    paddingBottom: 12,
    paddingHorizontal: 8,
  },
  companyCardIcon: {
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  companyCardBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  companyCardName: {
    fontSize: 18,
    fontWeight: '600',
  },
  companyCardMeta: {
    fontSize: 13,
  },
  companyCardButton: {
    marginTop: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  companyCardButtonPressed: {
    opacity: 0.9,
  },
  companyCardButtonText: {
    fontWeight: '600',
  },
  navBackButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 20,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBackButtonPressed: {
    opacity: 0.85,
  },
  navBackButtonText: {
    fontWeight: '600',
    fontSize: 13,
  },
});









