import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import * as authApi from '@/features/auth/api';
import type { DriverLookupResult, DriverSummary } from '@/features/auth/types';
import { useTheme } from '@/features/theme/theme-context';
import { getFriendlyError } from '@/features/shared/get-friendly-error';

type AdminDriverManagerProps = {
  onSelectDriver?: (driverId: string) => void;
  refreshSignal?: number;
};

export function AdminDriverManager({
  onSelectDriver,
  refreshSignal,
}: AdminDriverManagerProps) {
  const { token, workspaceId, workspaceName, user } = useAuth();
  const isDevUser = user?.role === 'dev';
  const showDriverSearch = isDevUser;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<DriverLookupResult | null>(null);
  const [suggestions, setSuggestions] = useState<DriverLookupResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [showDriverEditor, setShowDriverEditor] = useState(false);

  const loadDrivers = useMemo(
    () => async () => {
      if (!token || !workspaceId) {
        return;
      }
      try {
        setLoadingDrivers(true);
        setError(null);
        setDrivers(await authApi.fetchDrivers(token, workspaceId ?? undefined));
      } catch (err) {
        setError(
          getFriendlyError(err, {
            fallback: "We couldn't load drivers right now. Try again in a moment.",
          })
        );
      } finally {
        setLoadingDrivers(false);
      }
    },
    [token, workspaceId]
  );

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers, refreshSignal, workspaceId]);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (!isDevUser) {
        setSuggestions([]);
        setSuggestionsLoading(false);
        return;
      }
      if (!token) {
        return;
      }
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setSuggestions([]);
        return;
      }
      setSuggestionsLoading(true);
      try {
        const results = await authApi.searchDrivers(token, trimmed, workspaceId ?? undefined);
        setSuggestions(results);
      } catch (err) {
        console.warn('Driver suggestion search failed', err);
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    },
    [isDevUser, token, workspaceId]
  );

  const handleSearch = async (identifier?: string) => {
    if (!isDevUser) {
      setSearchError('Driver search is limited to developer accounts.');
      return;
    }
    const input =
      typeof identifier === 'string'
        ? identifier
        : typeof (identifier as any)?.nativeEvent?.text === 'string'
          ? (identifier as any).nativeEvent.text
          : searchValue;
    const trimmed = input?.trim?.() ?? '';
    if (!trimmed || !token) {
      setSearchError('Enter a name, email, or phone number.');
      return;
    }
    if (isDevUser) {
      void fetchSuggestions(trimmed);
    } else {
      setSuggestions([]);
    }
    setSearching(true);
    setSearchError(null);
    setLookupResult(null);
    try {
      const results = await authApi.searchDrivers(token, trimmed, workspaceId ?? undefined);
      if (results.length === 0) {
        setSearchError('No driver found with that query.');
        return;
      }
      setLookupResult(results[0]);
      setSuggestions(results);
    } catch (err) {
      setLookupResult(null);
      setSearchError(
        getFriendlyError(err, {
          fallback: 'No driver found with that query.',
        })
      );
    } finally {
      setSearching(false);
    }
  };

  const handleSuggestionSelect = (driver: DriverSummary) => {
    const identifier = driver.emailOrPhone;
    setSearchValue(identifier);
    setLookupResult(null);
    setSearchError(null);
    void handleSearch(identifier);
  };

  const refreshAfterChange = async (next: DriverLookupResult | null) => {
    setLookupResult(next);
    await loadDrivers();
  };

  const confirmAssign = (driver: DriverLookupResult) => {
    if (!workspaceId || !token) {
      setSearchError('Select a workspace to assign drivers.');
      return;
    }
    Alert.alert(
      'Add driver to workspace',
      `Add ${driver.fullName || driver.emailOrPhone} to ${workspaceName || 'this workspace'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          style: 'default',
          onPress: () => void handleAssign(driver),
        },
      ]
    );
  };

  const confirmDetach = (driver: DriverLookupResult) => {
    if (!workspaceId || !token) {
      setSearchError('Select a workspace to manage drivers.');
      return;
    }
    Alert.alert(
      'Remove driver',
      `Remove ${driver.fullName || driver.emailOrPhone} from ${workspaceName || 'this workspace'}?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void handleDetach(driver),
        },
      ]
    );
  };

  const handleAssign = async (driver: DriverLookupResult) => {
    if (!token || !workspaceId) {
      return;
    }
    setReassigning(true);
    try {
      await authApi.adminUpdateUserProfile(
        token,
        driver.id,
        { workspaceId },
        workspaceId
      );
      await refreshAfterChange({
        ...driver,
        workspaceId,
        workspaceName: workspaceName ?? null,
      });
    } catch (err) {
      setSearchError(
        getFriendlyError(err, { fallback: 'Could not add that driver. Try again.' })
      );
    } finally {
      setReassigning(false);
    }
  };

  const handleDetach = async (driver: DriverLookupResult) => {
    if (!token) {
      return;
    }
    setReassigning(true);
    try {
      await authApi.adminUpdateUserProfile(token, driver.id, { workspaceId: null }, workspaceId);
      await refreshAfterChange({
        ...driver,
        workspaceId: null,
        workspaceName: null,
      });
    } catch (err) {
      setSearchError(
        getFriendlyError(err, { fallback: 'Could not remove that driver. Try again.' })
      );
    } finally {
      setReassigning(false);
    }
  };

  const handlePromote = async (driver: DriverLookupResult) => {
    if (!token) {
      return;
    }
    setPromoting(true);
    try {
      await authApi.adminUpdateUserProfile(token, driver.id, { role: 'admin' }, workspaceId);
      Alert.alert('Driver promoted', `${driver.fullName || driver.emailOrPhone} is now an admin.`);
      setLookupResult(null);
      await loadDrivers();
    } catch (err) {
      setSearchError(
        getFriendlyError(err, { fallback: 'Could not promote that driver. Try again.' })
      );
    } finally {
      setPromoting(false);
    }
  };

  const confirmPromote = (driver: DriverLookupResult) => {
    Alert.alert(
      'Promote to admin',
      `Make ${driver.fullName || driver.emailOrPhone} an admin for this company?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Promote', style: 'default', onPress: () => void handlePromote(driver) },
      ]
    );
  };

  const renderLookupActions = () => {
    if (!lookupResult) {
      return null;
    }
    if (!workspaceId) {
      return <Text style={styles.lookupHint}>Select a workspace to manage drivers.</Text>;
    }
    if (!lookupResult.workspaceId) {
      return (
        <View style={styles.lookupActions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryPressed,
              reassigning && styles.primaryDisabled,
              styles.fullWidthButton,
            ]}
            disabled={reassigning}
            onPress={() => confirmAssign(lookupResult)}
          >
            <Text style={styles.primaryLabel}>
              Add to {workspaceName || 'workspace'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryPressed,
              promoting && styles.secondaryDisabled,
              styles.fullWidthButton,
            ]}
            disabled={promoting}
            onPress={() => confirmPromote(lookupResult)}
          >
            <Text style={styles.secondaryLabel}>Promote to admin</Text>
          </Pressable>
        </View>
      );
    }
    if (lookupResult.workspaceId === workspaceId) {
      return (
        <View style={styles.lookupActions}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryPressed,
              reassigning && styles.secondaryDisabled,
              styles.fullWidthButton,
            ]}
            disabled={reassigning}
            onPress={() => confirmDetach(lookupResult)}
          >
            <Text style={[styles.secondaryLabel, { color: colors.danger }]}>
              Remove from company
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryPressed,
              promoting && styles.secondaryDisabled,
              styles.fullWidthButton,
            ]}
            disabled={promoting}
            onPress={() => confirmPromote(lookupResult)}
          >
            <Text style={styles.secondaryLabel}>Promote to admin</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.lookupActions}>
        <Text style={styles.lookupHint}>
          Already assigned to {lookupResult.workspaceName || 'another workspace'}.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryPressed,
            promoting && styles.secondaryDisabled,
            styles.fullWidthButton,
          ]}
          disabled={promoting}
          onPress={() => confirmPromote(lookupResult)}
        >
          <Text style={styles.secondaryLabel}>Promote to admin</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Driver roster</Text>
      <Text style={styles.description}>
        Manage drivers in your workspace. Driver search is limited to developer accounts.
      </Text>
      {showDriverSearch ? (
        <View style={styles.searchCard}>
          <Text style={styles.columnHeading}>Find a driver</Text>
          <Text style={styles.searchHint}>
            Search by email or phone. Add them to your workspace or remove them if they already belong.
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="driver@example.com"
              placeholderTextColor={colors.mutedText}
              value={searchValue}
              onChangeText={(text) => {
                setSearchValue(text);
                setSearchError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onSubmitEditing={({ nativeEvent }) => void handleSearch(nativeEvent.text)}
            />
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryPressed,
                searching && styles.primaryDisabled,
              ]}
              onPress={() => void handleSearch()}
              disabled={searching}
            >
              {searching ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryLabel}>Search</Text>
              )}
            </Pressable>
          </View>
          {searchError ? <Text style={styles.error}>{searchError}</Text> : null}
          {suggestionsLoading ? (
            <View style={styles.suggestions}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
          {suggestions.length > 0 && isDevUser ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionHeading}>Suggestions</Text>
              {suggestions.map((driver) => (
                <Pressable
                  key={driver.id}
                  style={({ pressed }) => [
                    styles.suggestionItem,
                    pressed && styles.suggestionItemPressed,
                  ]}
                  onPress={() => handleSuggestionSelect(driver)}
                >
                  <View style={styles.suggestionText}>
                    <Text style={styles.suggestionName} numberOfLines={1}>
                      {driver.fullName || 'Driver'}
                    </Text>
                    <Text style={styles.suggestionContact} numberOfLines={1}>
                      {driver.emailOrPhone}
                    </Text>
                  </View>
                  <Text style={styles.suggestionAction}>Fill</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {lookupResult ? (
            <View style={styles.lookupResult}>
              <Text style={styles.lookupName}>{lookupResult.fullName || lookupResult.emailOrPhone}</Text>
              <Text style={styles.lookupSub}>{lookupResult.emailOrPhone}</Text>
              <Text style={styles.lookupHint}>
                {lookupResult.workspaceId
                  ? `Assigned to ${lookupResult.workspaceName || 'a workspace'}`
                  : 'Not assigned to any workspace.'}
              </Text>
              <View style={styles.lookupActions}>{renderLookupActions()}</View>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.driverColumn}>
        <Text style={styles.columnHeading}>Drivers</Text>
        {loadingDrivers ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : drivers.length === 0 ? (
          <Text style={styles.emptyText}>No drivers yet. Create one above.</Text>
        ) : (
          <ScrollView style={styles.driverList}>
            {drivers.map((driver) => (
              <Pressable
                key={driver.id}
                style={({ pressed }) => [styles.driverButton, pressed && styles.driverButtonPressed]}
                onPress={() => onSelectDriver?.(driver.id)}
              >
                <Text style={styles.driverName} numberOfLines={1}>
                  {driver.fullName || driver.emailOrPhone}
                </Text>
                <Text style={styles.driverSub} numberOfLines={1}>
                  {driver.emailOrPhone}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    container: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 16,
    },
    searchCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      gap: 8,
      backgroundColor: colors.surface,
    },
    searchHint: {
      color: colors.mutedText,
      fontSize: 13,
    },
    searchRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    searchHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    suggestions: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      marginTop: 8,
      backgroundColor: colors.surface,
    },
    suggestionHeading: {
      fontWeight: '600',
      color: colors.mutedText,
      fontSize: 12,
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 4,
    },
    suggestionItem: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    suggestionItemPressed: {
      backgroundColor: isDark ? '#0f172a' : colors.primaryMuted,
    },
    suggestionText: {
      flex: 1,
      gap: 2,
    },
    suggestionName: {
      fontWeight: '600',
      color: colors.text,
    },
    suggestionContact: {
      color: colors.mutedText,
      fontSize: 12,
    },
    suggestionAction: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 12,
    },
    searchInput: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    lookupResult: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 4,
      backgroundColor: isDark ? '#0f172a' : colors.primaryMuted,
    },
    lookupName: {
      fontWeight: '600',
      color: colors.text,
    },
    lookupSub: {
      color: colors.mutedText,
    },
    lookupHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    lookupActions: {
      gap: 8,
      marginTop: 8,
      alignItems: 'stretch',
    },
    heading: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    description: {
      color: colors.mutedText,
      lineHeight: 20,
    },
    content: {
      flexDirection: 'row',
      gap: 20,
    },
    driverColumn: {
      width: 220,
      gap: 12,
    },
    editorColumn: {
      flex: 1,
      gap: 12,
    },
    columnHeading: {
      fontWeight: '600',
      color: colors.text,
    },
    driverList: {
      maxHeight: 280,
    },
    driverButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
      backgroundColor: colors.surface,
    },
    driverButtonPressed: {
      opacity: 0.85,
    },
    driverName: {
      fontWeight: '600',
      color: colors.text,
    },
    driverSub: {
      color: colors.mutedText,
      fontSize: 12,
    },
    editorCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 16,
      gap: 12,
      backgroundColor: colors.surface,
    },
    selectedName: {
      fontWeight: '600',
      color: colors.text,
    },
    editorHint: {
      color: colors.mutedText,
      fontSize: 12,
    },
    textArea: {
      minHeight: 160,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
      textAlignVertical: 'top',
    },
    actions: {
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
    secondaryPressed: {
      opacity: 0.85,
    },
    secondaryDisabled: {
      opacity: 0.6,
    },
    secondaryLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    primaryButton: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primary,
    },
    primaryPressed: {
      opacity: 0.9,
    },
    primaryDisabled: {
      opacity: 0.6,
    },
    fullWidthButton: {
      alignSelf: 'stretch',
    },
    primaryLabel: {
      color: isDark ? colors.background : colors.surface,
      fontWeight: '600',
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
    error: {
      color: colors.danger,
    },
    success: {
      color: colors.success,
    },
  });
}


