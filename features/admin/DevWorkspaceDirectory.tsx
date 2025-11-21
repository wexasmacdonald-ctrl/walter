import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { DriverSummary, WorkspaceInvite, WorkspaceSummary } from '@/features/auth/types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

type DevWorkspaceDirectoryProps = {
  onOpenWorkspace?: () => void;
};

export function DevWorkspaceDirectory({ onOpenWorkspace }: DevWorkspaceDirectoryProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const {
    token,
    workspaceId,
    selectWorkspace,
    adminUpdateUserProfile,
  } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [newWorkspaceInvite, setNewWorkspaceInvite] = useState<WorkspaceInvite | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(workspaceId ?? null);
  const [workspaceDrivers, setWorkspaceDrivers] = useState<DriverSummary[]>([]);
  const [workspaceDriversLoading, setWorkspaceDriversLoading] = useState(false);
  const [workspaceDriversError, setWorkspaceDriversError] = useState<string | null>(null);
  const [freeDrivers, setFreeDrivers] = useState<DriverSummary[]>([]);
  const [freeDriversLoading, setFreeDriversLoading] = useState(false);
  const [freeDriversError, setFreeDriversError] = useState<string | null>(null);
  const [driverActionId, setDriverActionId] = useState<string | null>(null);
  const [driverActionType, setDriverActionType] = useState<'assign' | 'remove' | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const resolveWorkspaceError = useCallback((message: string) => {
    if (message.toLowerCase().includes('workspace not found')) {
      return 'Select or create a workspace before moving drivers.';
    }
    return message;
  }, []);

  useEffect(() => {
    setSelectedWorkspaceId(workspaceId ?? null);
  }, [workspaceId]);

  const selectedWorkspace =
    workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null;

  const loadWorkspaces = useCallback(async () => {
    if (!token) {
      return;
    }
    setWorkspacesLoading(true);
    setWorkspacesError(null);
    try {
      const list = await authApi.fetchDevWorkspaces(token);
      setWorkspaces(list);
    } catch (error) {
      setWorkspacesError(
        getFriendlyError(error, {
          fallback: "We couldn't load workspaces right now. Try again soon.",
        })
      );
    } finally {
      setWorkspacesLoading(false);
    }
  }, [token]);

  const loadWorkspaceDrivers = useCallback(
    async (workspaceToLoad: string | null) => {
      if (!token || !workspaceToLoad) {
        setWorkspaceDrivers([]);
        setWorkspaceDriversError(null);
        return;
      }
      setWorkspaceDriversLoading(true);
      setWorkspaceDriversError(null);
      try {
        const drivers = await authApi.fetchDrivers(token, workspaceToLoad);
        setWorkspaceDrivers(drivers);
      } catch (error) {
        setWorkspaceDriversError(
          getFriendlyError(error, {
            fallback: "We couldn't load that roster. Try again shortly.",
          })
        );
      } finally {
        setWorkspaceDriversLoading(false);
      }
    },
    [token]
  );

  const loadFreeDrivers = useCallback(async () => {
    if (!token) {
      return;
    }
    setFreeDriversLoading(true);
    setFreeDriversError(null);
    try {
      const drivers = await authApi.fetchDevFreeDrivers(token);
      setFreeDrivers(drivers);
    } catch (error) {
      setFreeDriversError(
        getFriendlyError(error, {
          fallback: "We couldn't load free-tier drivers. Try again shortly.",
        })
      );
    } finally {
      setFreeDriversLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    void loadWorkspaceDrivers(selectedWorkspaceId);
  }, [loadWorkspaceDrivers, selectedWorkspaceId]);

  useEffect(() => {
    void loadFreeDrivers();
  }, [loadFreeDrivers]);

  const handleCreateWorkspace = async () => {
    if (!token || creatingWorkspace) {
      return;
    }
    const trimmed = newWorkspaceName.trim();
    if (!trimmed) {
      Alert.alert('Workspace name required', 'Enter a name before creating the workspace.');
      return;
    }
    setCreatingWorkspace(true);
    setNewWorkspaceInvite(null);
    try {
      const result = await authApi.createDevWorkspace(token, { name: trimmed });
      setWorkspaces((prev) => [result.workspace, ...prev]);
      setNewWorkspaceName('');
      setNewWorkspaceInvite(result.invite);
      await selectWorkspace(result.workspace.id);
      setSelectedWorkspaceId(result.workspace.id);
      setTransferMessage(`${result.workspace.name} is ready. Start inviting your drivers.`);
      onOpenWorkspace?.();
      void loadWorkspaceDrivers(result.workspace.id);
    } catch (error) {
      Alert.alert(
        'Workspace not created',
        getFriendlyError(error, {
          fallback: "We couldn't create that workspace. Try again.",
        })
      );
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleSelectWorkspace = async (workspace: WorkspaceSummary, openAfterSelect: boolean) => {
    await selectWorkspace(workspace.id);
    setSelectedWorkspaceId(workspace.id);
    setTransferMessage(null);
    if (openAfterSelect) {
      onOpenWorkspace?.();
    }
  };

  const handleRemoveDriver = async (driver: DriverSummary) => {
    if (!selectedWorkspaceId) {
      return;
    }
    setDriverActionId(driver.id);
    setDriverActionType('remove');
    setTransferMessage(null);
    try {
      await adminUpdateUserProfile(driver.id, { workspaceId: null });
      await Promise.allSettled([
        loadWorkspaceDrivers(selectedWorkspaceId),
        loadFreeDrivers(),
      ]);
      setTransferMessage(
        `${driver.fullName ?? driver.emailOrPhone} is back on the free tier.`
      );
    } catch (error) {
      Alert.alert(
        'Move failed',
        resolveWorkspaceError(
          getFriendlyError(error, {
            fallback: "We couldn't remove that driver. Try again.",
          })
        )
      );
    } finally {
      setDriverActionId(null);
      setDriverActionType(null);
    }
  };

  const handleAssignDriver = async (driver: DriverSummary) => {
    if (!selectedWorkspaceId) {
      Alert.alert('Pick a workspace', 'Select a company before assigning drivers.');
      return;
    }
    setDriverActionId(driver.id);
    setDriverActionType('assign');
    setTransferMessage(null);
    try {
      await adminUpdateUserProfile(driver.id, { workspaceId: selectedWorkspaceId });
      await Promise.allSettled([
        loadWorkspaceDrivers(selectedWorkspaceId),
        loadFreeDrivers(),
      ]);
      setTransferMessage(
        `${driver.fullName ?? driver.emailOrPhone} joined ${selectedWorkspace?.name ?? 'the workspace'}.`
      );
    } catch (error) {
      Alert.alert(
        'Assignment failed',
        resolveWorkspaceError(
          getFriendlyError(error, {
            fallback: "We couldn't move that driver. Try again.",
          })
        )
      );
    } finally {
      setDriverActionId(null);
      setDriverActionType(null);
    }
  };

  const renderWorkspaceCard = (workspace: WorkspaceSummary) => {
    const isActive = workspace.id === selectedWorkspaceId;
    return (
      <Pressable
        key={workspace.id}
        style={({ pressed }) => [
          styles.workspaceCard,
          isActive && styles.workspaceCardActive,
          pressed && styles.workspaceCardPressed,
        ]}
        onPress={() => void handleSelectWorkspace(workspace, false)}
      >
        <View style={styles.workspaceHeader}>
          <View>
            <Text style={styles.workspaceName}>{workspace.name}</Text>
            {workspace.createdAt ? (
              <Text style={styles.workspaceSub}>Created {formatDate(workspace.createdAt)}</Text>
            ) : null}
          </View>
          {isActive ? <Text style={styles.workspaceBadge}>Active</Text> : null}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
          onPress={() => void handleSelectWorkspace(workspace, true)}
        >
          <Text style={styles.primaryButtonText}>Open workspace</Text>
        </Pressable>
      </Pressable>
    );
  };

  const renderDriverRow = (
    driver: DriverSummary,
    action: 'assign' | 'remove',
    disabled: boolean
  ) => {
    const busy = driverActionId === driver.id && driverActionType === action;
    const label =
      action === 'assign'
        ? `Add to ${selectedWorkspace?.name ?? 'workspace'}`
        : 'Move to free tier';
    const onPress = action === 'assign'
      ? () => void handleAssignDriver(driver)
      : () => void handleRemoveDriver(driver);
    return (
      <View key={driver.id} style={styles.driverRow}>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{driver.fullName ?? 'Unnamed driver'}</Text>
          <Text style={styles.driverContact}>{driver.emailOrPhone}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.transferButton,
            (pressed || busy) && styles.transferButtonPressed,
            disabled && styles.transferButtonDisabled,
          ]}
          onPress={onPress}
          disabled={disabled || busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Text style={styles.transferButtonText}>{label}</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Workspace directory</Text>
        <Text style={styles.heroBody}>
          Create polished companies, share invite codes, and move drivers between teams without
          leaving this console.
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{workspaces.length}</Text>
            <Text style={styles.statLabel}>Companies</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{freeDrivers.length}</Text>
            <Text style={styles.statLabel}>Free tier drivers</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create a new workspace</Text>
        <Text style={styles.cardBody}>
          Launch a ready-to-use company profile with a single click. The first invite code is
          generated automatically so you can onboard drivers right away.
        </Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>Workspace name</Text>
          <TextInput
            value={newWorkspaceName}
            onChangeText={setNewWorkspaceName}
            style={styles.textInput}
            placeholder="Acme Logistics"
            placeholderTextColor={colors.mutedText}
          />
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            creatingWorkspace && styles.primaryButtonDisabled,
          ]}
          onPress={handleCreateWorkspace}
          disabled={creatingWorkspace}
        >
          {creatingWorkspace ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>Create workspace</Text>
          )}
        </Pressable>
        {newWorkspaceInvite ? (
          <View style={styles.inviteCard}>
            <Text style={styles.inviteHint}>Invite code</Text>
            <Text style={styles.inviteCode}>{newWorkspaceInvite.code}</Text>
            <Text style={styles.inviteCaption}>
              Share the invite code with dispatchers or drivers who should join this workspace.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Companies</Text>
          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            onPress={() => void loadWorkspaces()}
          >
            <Text style={styles.linkButtonText}>Refresh list</Text>
          </Pressable>
        </View>
        {workspacesError ? <Text style={styles.errorText}>{workspacesError}</Text> : null}
        {workspacesLoading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loaderText}>Loading workspaces...</Text>
          </View>
        ) : workspaces.length === 0 ? (
          <Text style={styles.emptyText}>No workspaces yet. Create one above.</Text>
        ) : (
          <View style={styles.workspaceGrid}>
            {workspaces.map((workspace) => renderWorkspaceCard(workspace))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Driver transfers</Text>
        <Text style={styles.cardBody}>
          Select a company to review its driver list, remove inactive accounts, or promote free-tier
          drivers into the team.
        </Text>
        {transferMessage ? <Text style={styles.successText}>{transferMessage}</Text> : null}
        <View style={styles.transferColumns}>
          <View style={styles.transferColumn}>
            <View style={styles.columnHeader}>
              <Text style={styles.columnTitle}>
                {selectedWorkspace?.name ?? 'Select a workspace'}
              </Text>
              {selectedWorkspace ? (
                <Text style={styles.columnSub}>Driver roster</Text>
              ) : (
                <Text style={styles.columnSub}>Pick a company above to manage</Text>
              )}
            </View>
            {workspaceDriversError ? (
              <Text style={styles.errorText}>{workspaceDriversError}</Text>
            ) : workspaceDriversLoading ? (
              <View style={styles.loaderRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loaderText}>Loading drivers...</Text>
              </View>
            ) : workspaceDrivers.length === 0 ? (
              <Text style={styles.emptyText}>
                {selectedWorkspace
                  ? 'No drivers yet. Invite a team member to populate this list.'
                  : 'Select a workspace to see its roster.'}
              </Text>
            ) : (
              workspaceDrivers.map((driver) =>
                renderDriverRow(driver, 'remove', !selectedWorkspaceId)
              )
            )}
          </View>
          <View style={styles.transferColumn}>
            <View style={styles.columnHeader}>
              <Text style={styles.columnTitle}>Free tier</Text>
              <Text style={styles.columnSub}>Ready to assign</Text>
            </View>
            {freeDriversError ? (
              <Text style={styles.errorText}>{freeDriversError}</Text>
            ) : freeDriversLoading ? (
              <View style={styles.loaderRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loaderText}>Loading free-tier drivers...</Text>
              </View>
            ) : freeDrivers.length === 0 ? (
              <Text style={styles.emptyText}>
                Every driver currently belongs to a workspace.
              </Text>
            ) : (
              freeDrivers.map((driver) =>
                renderDriverRow(driver, 'assign', !selectedWorkspaceId)
              )
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    container: {
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 96,
      gap: 24,
    },
    heroCard: {
      borderRadius: 16,
      padding: 24,
      backgroundColor: isDark ? '#0f172a' : '#dbeafe',
      borderWidth: 1,
      borderColor: colors.border,
      gap: 16,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: isDark ? colors.surface : '#0f172a',
    },
    heroBody: {
      color: isDark ? colors.mutedText : '#0f172a',
      lineHeight: 20,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 16,
    },
    statCard: {
      flex: 1,
      borderRadius: 12,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'flex-start',
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    statLabel: {
      color: colors.mutedText,
      textTransform: 'uppercase',
      fontSize: 11,
      letterSpacing: 0.8,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 24,
      gap: 16,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    cardBody: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    formField: {
      gap: 8,
    },
    formLabel: {
      fontWeight: '600',
      color: colors.text,
    },
    textInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    primaryButton: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    primaryButtonPressed: {
      opacity: 0.9,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: colors.surface,
      fontWeight: '600',
    },
    secondaryButton: {
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondaryButtonPressed: {
      opacity: 0.85,
    },
    secondaryButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    inviteCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 4,
      backgroundColor: colors.surface,
    },
    inviteHint: {
      fontSize: 12,
      color: colors.mutedText,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    inviteCode: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primary,
    },
    inviteCaption: {
      color: colors.mutedText,
    },
    linkButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    linkButtonPressed: {
      opacity: 0.9,
    },
    linkButtonText: {
      color: colors.surface,
      fontWeight: '600',
      fontSize: 12,
    },
    workspaceGrid: {
      gap: 16,
    },
    workspaceCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 16,
      backgroundColor: colors.surface,
    },
    workspaceCardActive: {
      borderColor: colors.primary,
    },
    workspaceCardPressed: {
      opacity: 0.9,
    },
    workspaceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    workspaceName: {
      fontWeight: '600',
      fontSize: 16,
      color: colors.text,
    },
    workspaceSub: {
      color: colors.mutedText,
      fontSize: 12,
    },
    workspaceBadge: {
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.primary,
      color: isDark ? colors.background : colors.surface,
      fontWeight: '600',
      fontSize: 12,
    },
    loaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    loaderText: {
      color: colors.mutedText,
    },
    emptyText: {
      color: colors.mutedText,
      fontStyle: 'italic',
    },
    errorText: {
      color: colors.danger,
    },
    successText: {
      color: colors.success,
      fontWeight: '600',
    },
    transferColumns: {
      flexDirection: 'column',
      gap: 24,
    },
    transferColumn: {
      gap: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      backgroundColor: colors.surface,
    },
    columnHeader: {
      gap: 4,
    },
    columnTitle: {
      fontWeight: '600',
      fontSize: 16,
      color: colors.text,
    },
    columnSub: {
      color: colors.mutedText,
      fontSize: 12,
    },
    driverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    driverInfo: {
      flex: 1,
    },
    driverName: {
      color: colors.text,
      fontWeight: '600',
    },
    driverContact: {
      color: colors.mutedText,
      fontSize: 12,
    },
    transferButton: {
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.primary,
      minWidth: 140,
      alignItems: 'center',
      justifyContent: 'center',
    },
    transferButtonPressed: {
      opacity: 0.9,
    },
    transferButtonDisabled: {
      opacity: 0.6,
    },
    transferButtonText: {
      color: colors.surface,
      fontWeight: '600',
      fontSize: 12,
      textAlign: 'center',
    },
  });
}
