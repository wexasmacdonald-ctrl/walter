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

type DirectoryView = 'menu' | 'workspace' | 'free-tier';

export function DevWorkspaceDirectory({ onOpenWorkspace }: DevWorkspaceDirectoryProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { token, workspaceId, selectWorkspace, adminUpdateUserProfile } = useAuth();
  const [view, setView] = useState<DirectoryView>('menu');
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [newWorkspaceInvite, setNewWorkspaceInvite] = useState<WorkspaceInvite | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(workspaceId ?? null);
  const [workspaceDrivers, setWorkspaceDrivers] = useState<DriverSummary[]>([]);
  const [workspaceDriversLoading, setWorkspaceDriversLoading] = useState(false);
  const [workspaceDriversError, setWorkspaceDriversError] = useState<string | null>(null);
  const [freeDrivers, setFreeDrivers] = useState<DriverSummary[]>([]);
  const [freeDriversLoading, setFreeDriversLoading] = useState(false);
  const [freeDriversError, setFreeDriversError] = useState<string | null>(null);
  const [freeTierTargetId, setFreeTierTargetId] = useState<string | null>(null);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [inviteProcessing, setInviteProcessing] = useState(false);
  const [driverActionId, setDriverActionId] = useState<string | null>(null);
  const [driverActionType, setDriverActionType] = useState<'assign' | 'remove' | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const resolveWorkspaceError = useCallback((message: string) => {
    if (message.toLowerCase().includes('workspace not found')) {
      return 'Select or create a workspace before moving drivers.';
    }
    return message;
  }, []);

  useEffect(() => {
    setActiveWorkspaceId(workspaceId ?? null);
  }, [workspaceId]);

  const activeWorkspace =
    workspaces.find((entry) => entry.id === activeWorkspaceId) ?? null;

  const loadWorkspaces = useCallback(async () => {
    if (!token) {
      return;
    }
    setWorkspacesLoading(true);
    setWorkspacesError(null);
    try {
      const list = await authApi.fetchDevWorkspaces(token);
      setWorkspaces(dedupeWorkspaces(list));
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

  const loadWorkspaceInvites = useCallback(
    async (workspaceToLoad: string | null) => {
      if (!token || !workspaceToLoad) {
        setInvites([]);
        setInvitesError(null);
        return;
      }
      setInvitesLoading(true);
      setInvitesError(null);
      try {
        const list = await authApi.getWorkspaceInvites(token, workspaceToLoad);
        setInvites(list);
      } catch (error) {
        setInvitesError(
          error instanceof Error
            ? error.message
            : "We couldn't load invite codes. Try again."
        );
      } finally {
        setInvitesLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    void loadWorkspaceDrivers(activeWorkspaceId);
  }, [loadWorkspaceDrivers, activeWorkspaceId]);

  useEffect(() => {
    void loadFreeDrivers();
  }, [loadFreeDrivers]);

  useEffect(() => {
    void loadWorkspaceInvites(activeWorkspaceId);
  }, [loadWorkspaceInvites, activeWorkspaceId]);

  useEffect(() => {
    if (!token || workspaces.length === 0) {
      return;
    }
    if (activeWorkspaceId && workspaces.some((entry) => entry.id === activeWorkspaceId)) {
      return;
    }
    const fallback = workspaces[0];
    setActiveWorkspaceId(fallback.id);
    void selectWorkspace(fallback.id);
  }, [token, workspaces, activeWorkspaceId, selectWorkspace]);

  useEffect(() => {
    if (workspaces.length === 0) {
      setFreeTierTargetId(null);
      return;
    }
    if (freeTierTargetId && workspaces.some((entry) => entry.id === freeTierTargetId)) {
      return;
    }
    setFreeTierTargetId(workspaces[0].id);
  }, [workspaces, freeTierTargetId]);

  const focusWorkspace = useCallback(
    async (workspaceToSelect: string | null) => {
      await selectWorkspace(workspaceToSelect);
      setActiveWorkspaceId(workspaceToSelect);
    },
    [selectWorkspace]
  );

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
      setWorkspaces((prev) => dedupeWorkspaces([result.workspace, ...prev]));
      setNewWorkspaceName('');
      setNewWorkspaceInvite(result.invite);
      setTransferMessage(`${result.workspace.name} is ready. Start inviting your drivers.`);
      setView('workspace');
      setFreeTierTargetId(result.workspace.id);
      await focusWorkspace(result.workspace.id);
      void loadWorkspaceDrivers(result.workspace.id);
      void loadFreeDrivers();
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

  const handleOpenWorkspace = async (workspace: WorkspaceSummary) => {
    await focusWorkspace(workspace.id);
    setTransferMessage(null);
    setView('workspace');
  };

  const handleBackToDirectory = () => {
    setView('menu');
    setTransferMessage(null);
  };

  const handleOpenFreeTier = () => {
    setView('free-tier');
    setTransferMessage(null);
  };

  const handleOpenWorkspaceOps = async () => {
    if (!activeWorkspace) {
      Alert.alert('Pick a company', 'Select a workspace before opening driver tools.');
      return;
    }
    await focusWorkspace(activeWorkspace.id);
    onOpenWorkspace?.();
  };

  const handleRemoveDriver = async (driver: DriverSummary) => {
    if (!activeWorkspaceId) {
      return;
    }
    setDriverActionId(driver.id);
    setDriverActionType('remove');
    setTransferMessage(null);
    try {
      await adminUpdateUserProfile(driver.id, { workspaceId: null });
      await Promise.allSettled([
        loadWorkspaceDrivers(activeWorkspaceId),
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

  const handleAssignDriver = async (driver: DriverSummary, destinationId?: string | null) => {
    const targetId = destinationId ?? activeWorkspaceId;
    if (!targetId) {
      Alert.alert('Pick a workspace', 'Select a company before assigning drivers.');
      return;
    }
    const targetWorkspace =
      workspaces.find((entry) => entry.id === targetId) ?? activeWorkspace;
    setDriverActionId(driver.id);
    setDriverActionType('assign');
    setTransferMessage(null);
    try {
      await adminUpdateUserProfile(driver.id, { workspaceId: targetId });
      if (targetId === activeWorkspaceId) {
        await loadWorkspaceDrivers(targetId);
      }
      await loadFreeDrivers();
      setTransferMessage(
        `${driver.fullName ?? driver.emailOrPhone} joined ${targetWorkspace?.name ?? 'the workspace'}.`
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

  const handleDeleteWorkspace = async (workspace: WorkspaceSummary) => {
    if (!token) {
      return;
    }
    setDeletingWorkspaceId(workspace.id);
    setTransferMessage(null);
    try {
      await authApi.deleteDevWorkspace(token, workspace.id);
      setWorkspaces((prev) => prev.filter((entry) => entry.id !== workspace.id));
      if (workspace.id === activeWorkspaceId) {
        setActiveWorkspaceId(null);
        setWorkspaceDrivers([]);
        setInvites([]);
        setView('menu');
        setTransferMessage('Workspace deleted. Drivers moved to the free tier.');
      }
      void loadWorkspaces();
      void loadFreeDrivers();
    } catch (error) {
      Alert.alert(
        'Delete failed',
        getFriendlyError(error, {
          fallback: "We couldn't delete that workspace. Try again.",
        })
      );
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const confirmDeleteWorkspace = (workspace: WorkspaceSummary) => {
    Alert.alert(
      'Delete workspace?',
      `This removes ${workspace.name} and returns every driver to the free tier.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete workspace',
          style: 'destructive',
          onPress: () => {
            void handleDeleteWorkspace(workspace);
          },
        },
      ]
    );
  };

  const handleCreateInvite = async () => {
    if (!token || !activeWorkspaceId || inviteProcessing) {
      return;
    }
    const trimmedLabel = inviteLabel.trim();
    const trimmedMaxUses = inviteMaxUses.trim();
    const trimmedExpires = inviteExpiresAt.trim();
    let parsedMax: number | null = null;
    if (trimmedMaxUses.length > 0) {
      parsedMax = Number.parseInt(trimmedMaxUses, 10);
      if (!parsedMax || parsedMax <= 0) {
        setInvitesError('Max uses must be a positive number.');
        return;
      }
    }
    setInviteProcessing(true);
    setInvitesError(null);
    try {
      const invite = await authApi.createWorkspaceInviteCode(token, activeWorkspaceId, {
        label: trimmedLabel || null,
        maxUses: parsedMax,
        expiresAt: trimmedExpires || null,
      });
      setInvites((prev) => [invite, ...prev]);
      setInviteLabel('');
      setInviteMaxUses('');
      setInviteExpiresAt('');
    } catch (error) {
      setInvitesError(
        error instanceof Error ? error.message : 'Failed to create invite code. Try again.'
      );
    } finally {
      setInviteProcessing(false);
    }
  };

  const renderDriverRow = (
    driver: DriverSummary,
    action: 'assign' | 'remove',
    disabled: boolean,
    destinationId?: string | null
  ) => {
    const busy = driverActionId === driver.id && driverActionType === action;
    const destinationWorkspace =
      destinationId && action === 'assign'
        ? workspaces.find((entry) => entry.id === destinationId)
        : activeWorkspace;
    const label =
      action === 'assign'
        ? destinationWorkspace
          ? `Add to ${destinationWorkspace.name}`
          : 'Add to workspace'
        : 'Move to free tier';
    const onPress =
      action === 'assign'
        ? () => void handleAssignDriver(driver, destinationId)
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

  const renderWorkspaceButton = (workspace: WorkspaceSummary) => {
    const deleting = deletingWorkspaceId === workspace.id;
    return (
      <View key={workspace.id} style={styles.processRow}>
        <Pressable
          onPress={() => void handleOpenWorkspace(workspace)}
          style={({ pressed }) => [
            styles.processButton,
            pressed && styles.processButtonPressed,
            workspace.id === activeWorkspaceId && styles.processButtonActive,
          ]}
        >
          <View style={styles.processHeader}>
            <Text style={styles.processName}>{workspace.name}</Text>
            <Text style={styles.processBadge}>Company</Text>
          </View>
          {workspace.createdAt ? (
            <Text style={styles.processHint}>Created {formatDate(workspace.createdAt)}</Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.deleteProcessButton,
            pressed && styles.deleteProcessButtonPressed,
            deleting && styles.deleteProcessButtonDisabled,
          ]}
          disabled={deleting}
          onPress={() => confirmDeleteWorkspace(workspace)}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.surface} />
          ) : (
            <Text style={styles.deleteProcessButtonText}>Delete</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderMenuView = () => (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Workspace directory</Text>
        <Text style={styles.heroBody}>
          Pick a process to open a full-page console. Every company and the free tier has its own
          button so you always see the whole story.
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
          Launch a ready-to-use company profile with a single click. A shareable invite code appears
          instantly so dispatchers can join the team.
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
          <Text style={styles.cardTitle}>Processes</Text>
          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            onPress={() => void loadWorkspaces()}
          >
            <Text style={styles.linkButtonText}>Refresh companies</Text>
          </Pressable>
        </View>
        <Text style={styles.cardBody}>
          Buttons appear under each other so nothing is hidden. Select the view you want to manage.
        </Text>
        <View style={styles.processList}>
          <Pressable
            style={({ pressed }) => [
              styles.processButton,
              pressed && styles.processButtonPressed,
              view === 'free-tier' && styles.processButtonActive,
            ]}
            onPress={handleOpenFreeTier}
          >
            <View style={styles.processHeader}>
              <Text style={styles.processName}>Free tier users</Text>
              <Text style={styles.processBadge}>Roster</Text>
            </View>
            {freeDriversLoading ? (
              <Text style={styles.processHint}>Loading driver count...</Text>
            ) : (
              <Text style={styles.processHint}>
                {freeDrivers.length === 0
                  ? 'No drivers waiting right now.'
                  : `${freeDrivers.length} driver${freeDrivers.length === 1 ? '' : 's'} waiting.`}
              </Text>
            )}
          </Pressable>
          {workspacesError ? <Text style={styles.errorText}>{workspacesError}</Text> : null}
          {workspacesLoading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loaderText}>Loading workspaces...</Text>
            </View>
          ) : workspaces.length === 0 ? (
            <Text style={styles.emptyText}>No companies yet. Create your first workspace above.</Text>
          ) : (
            workspaces.map(renderWorkspaceButton)
          )}
        </View>
      </View>
    </ScrollView>
  );

  const renderWorkspaceView = () => (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.detailCard}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={handleBackToDirectory}
        >
          <Text style={styles.backButtonText}>← Back to directory</Text>
        </Pressable>
        <Text style={styles.detailTitle}>{activeWorkspace?.name ?? 'Select a company'}</Text>
        {activeWorkspace?.createdAt ? (
          <Text style={styles.detailSub}>Created {formatDate(activeWorkspace.createdAt)}</Text>
        ) : null}
        {transferMessage ? <Text style={styles.successText}>{transferMessage}</Text> : null}
        <View style={styles.detailActions}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={handleOpenFreeTier}
          >
            <Text style={styles.secondaryButtonText}>Free tier roster</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={handleOpenWorkspaceOps}
          >
            <Text style={styles.primaryButtonText}>Open driver ops</Text>
          </Pressable>
        </View>
      </View>

      {activeWorkspace ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Invite codes</Text>
            <Text style={styles.cardBody}>
              Share single-use or multi-use codes with dispatchers. Each code unlocks the business
              tier automatically.
            </Text>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Label (optional)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. East hub"
                placeholderTextColor={colors.mutedText}
                value={inviteLabel}
                onChangeText={setInviteLabel}
              />
            </View>
            <View style={styles.formRow}>
              <View style={[styles.formField, styles.formHalf]}>
                <Text style={styles.formLabel}>Max uses</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Unlimited"
                  placeholderTextColor={colors.mutedText}
                  value={inviteMaxUses}
                  onChangeText={setInviteMaxUses}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.formField, styles.formHalf]}>
                <Text style={styles.formLabel}>Expires at</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedText}
                  value={inviteExpiresAt}
                  onChangeText={setInviteExpiresAt}
                />
              </View>
            </View>
            {invitesError ? <Text style={styles.errorText}>{invitesError}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                inviteProcessing && styles.primaryButtonDisabled,
              ]}
              onPress={handleCreateInvite}
              disabled={inviteProcessing}
            >
              {inviteProcessing ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryButtonText}>Create invite</Text>
              )}
            </Pressable>
            <View style={styles.inviteList}>
              {invitesLoading ? (
                <View style={styles.loaderRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.loaderText}>Loading invites…</Text>
                </View>
              ) : invites.length === 0 ? (
                <Text style={styles.cardBody}>No invites yet. Create your first code above.</Text>
              ) : (
                invites.map((invite) => (
                  <View key={invite.id} style={styles.inviteRow}>
                    <View style={styles.inviteRowHeader}>
                      <Text style={styles.inviteCode}>{invite.code}</Text>
                      <Text style={styles.inviteUses}>
                        {invite.maxUses
                          ? `${invite.uses}/${invite.maxUses}`
                          : `${invite.uses} use${invite.uses === 1 ? '' : 's'}`}
                      </Text>
                    </View>
                    {invite.label ? (
                      <Text style={styles.inviteLabel}>{invite.label}</Text>
                    ) : null}
                    {invite.expiresAt ? (
                      <Text style={styles.inviteExpire}>
                        Expires {new Date(invite.expiresAt).toLocaleString()}
                      </Text>
                    ) : (
                      <Text style={styles.inviteExpire}>No expiry</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Driver roster</Text>
              <Pressable
                style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
                onPress={() => void loadWorkspaceDrivers(activeWorkspace.id)}
              >
                <Text style={styles.linkButtonText}>Refresh roster</Text>
              </Pressable>
            </View>
            <Text style={styles.cardBody}>
              Everyone currently assigned to {activeWorkspace.name}.
            </Text>
            {workspaceDriversError ? (
              <Text style={styles.errorText}>{workspaceDriversError}</Text>
            ) : workspaceDriversLoading ? (
              <View style={styles.loaderRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loaderText}>Loading drivers...</Text>
              </View>
            ) : workspaceDrivers.length === 0 ? (
              <Text style={styles.emptyText}>
                No drivers yet. Jump to the free tier to assign your first user.
              </Text>
            ) : (
              workspaceDrivers.map((driver) => renderDriverRow(driver, 'remove', false))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Danger zone</Text>
            <Text style={styles.cardBody}>
              Deleting a workspace moves every driver back to the free tier immediately.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.dangerButton,
                pressed && styles.dangerButtonPressed,
                deletingWorkspaceId === activeWorkspace.id && styles.dangerButtonDisabled,
              ]}
              onPress={() => confirmDeleteWorkspace(activeWorkspace)}
              disabled={deletingWorkspaceId === activeWorkspace.id}
            >
              {deletingWorkspaceId === activeWorkspace.id ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Text style={styles.dangerButtonText}>Delete workspace</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Select a company</Text>
          <Text style={styles.cardBody}>
            Choose a workspace from the directory to see its drivers and invite codes.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={handleBackToDirectory}
          >
            <Text style={styles.primaryButtonText}>Open directory</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );

  const renderFreeTierView = () => (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.detailCard}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={handleBackToDirectory}
        >
          <Text style={styles.backButtonText}>← Back to directory</Text>
        </Pressable>
        <Text style={styles.detailTitle}>Free tier users</Text>
        <Text style={styles.detailSub}>Drivers waiting for a company assignment.</Text>
        {transferMessage ? <Text style={styles.successText}>{transferMessage}</Text> : null}
        <View style={styles.formField}>
          <Text style={styles.formLabel}>Assign drivers to</Text>
          {workspaces.length === 0 ? (
            <Text style={styles.emptyText}>Create a workspace before assigning drivers.</Text>
          ) : (
            <View style={styles.targetList}>
              {workspaces.map((workspace) => (
                <Pressable
                  key={workspace.id}
                  style={({ pressed }) => [
                    styles.targetButton,
                    pressed && styles.targetButtonPressed,
                    freeTierTargetId === workspace.id && styles.targetButtonActive,
                  ]}
                  onPress={() => setFreeTierTargetId(workspace.id)}
                >
                  <Text
                    style={[
                      styles.targetButtonText,
                      freeTierTargetId === workspace.id && styles.targetButtonTextActive,
                    ]}
                  >
                    {workspace.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Unassigned drivers</Text>
          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            onPress={() => void loadFreeDrivers()}
          >
            <Text style={styles.linkButtonText}>Refresh list</Text>
          </Pressable>
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
            renderDriverRow(driver, 'assign', !freeTierTargetId, freeTierTargetId)
          )
        )}
      </View>
    </ScrollView>
  );

  if (view === 'workspace') {
    return renderWorkspaceView();
  }
  if (view === 'free-tier') {
    return renderFreeTierView();
  }
  return renderMenuView();
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

function dedupeWorkspaces(list: WorkspaceSummary[]): WorkspaceSummary[] {
  const seen = new Map<string, WorkspaceSummary>();
  list.forEach((workspace) => {
    seen.set(workspace.id, workspace);
  });
  return Array.from(seen.values());
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
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
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 16,
      backgroundColor: colors.surface,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardTitle: {
      fontWeight: '600',
      fontSize: 18,
      color: colors.text,
    },
    cardBody: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    formField: {
      gap: 8,
    },
    formRow: {
      flexDirection: 'row',
      gap: 12,
    },
    formHalf: {
      flex: 1,
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
    textInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    primaryButton: {
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
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
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    secondaryButtonPressed: {
      opacity: 0.9,
    },
    secondaryButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    inviteCard: {
      gap: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      backgroundColor: isDark ? '#1e293b' : '#eff6ff',
    },
    inviteHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    inviteCode: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
    },
    inviteCaption: {
      color: colors.mutedText,
    },
    processList: {
      gap: 12,
    },
    processRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    processButton: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      backgroundColor: colors.surface,
      gap: 4,
      flex: 1,
    },
    processButtonPressed: {
      opacity: 0.9,
    },
    processButtonActive: {
      borderColor: colors.primary,
    },
    processHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    processName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    processBadge: {
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.primary,
      color: isDark ? colors.background : colors.surface,
      fontSize: 12,
      fontWeight: '600',
    },
    processHint: {
      color: colors.mutedText,
      fontSize: 13,
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
    detailCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
      backgroundColor: colors.surface,
    },
    backButton: {
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    backButtonPressed: {
      opacity: 0.85,
    },
    backButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    detailTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
    },
    detailSub: {
      color: colors.mutedText,
    },
    detailActions: {
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
    },
    inviteList: {
      gap: 12,
    },
    inviteRow: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 4,
    },
    inviteRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    inviteUses: {
      color: colors.mutedText,
      fontSize: 12,
    },
    inviteLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    inviteExpire: {
      color: colors.mutedText,
      fontSize: 12,
    },
    linkButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    linkButtonPressed: {
      opacity: 0.85,
    },
    linkButtonText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 12,
    },
    targetList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    targetButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
    },
    targetButtonActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    targetButtonPressed: {
      opacity: 0.85,
    },
    targetButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    targetButtonTextActive: {
      color: colors.surface,
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
    dangerButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.danger,
      paddingVertical: 10,
      alignItems: 'center',
    },
    dangerButtonPressed: {
      backgroundColor: colors.dangerMuted,
    },
    dangerButtonDisabled: {
      opacity: 0.7,
    },
    dangerButtonText: {
      color: colors.danger,
      fontWeight: '600',
    },
    successText: {
      color: colors.success,
      fontWeight: '600',
    },
    errorText: {
      color: colors.danger,
    },
    deleteProcessButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.danger,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteProcessButtonPressed: {
      opacity: 0.85,
    },
    deleteProcessButtonDisabled: {
      opacity: 0.6,
    },
    deleteProcessButtonText: {
      color: colors.surface,
      fontWeight: '600',
      fontSize: 12,
    },
  });
}
