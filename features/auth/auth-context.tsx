import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as authApi from './api';
import type {
  AccountProfile,
  AdminUserProfileUpdateResponse,
  AuthUser,
  CreateUserInput,
  CreateUserResponse,
  ResetUserPasswordResponse,
  RegisterInput,
  UserRole,
} from './types';

const AUTH_STORAGE_KEY = 'auth/session';
const DEV_WORKSPACE_KEY = 'auth/dev-workspace';
const DEV_WORKSPACE_NAME_KEY = 'auth/dev-workspace-name';
const IMPERSONATOR_STORAGE_KEY = 'auth/impersonator';

type AuthStatus = 'loading' | 'ready';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  workspaceId: string | null;
  workspaceName: string | null;
  impersonatorSession: AuthSession | null;
  isImpersonating: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  createUser: (input: CreateUserInput) => Promise<CreateUserResponse>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteMyData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  getProfile: () => Promise<AccountProfile>;
  updateProfile: (profile: {
    fullName?: string | null;
    emailOrPhone?: string;
    businessName?: string | null;
  }) => Promise<AccountProfile>;
  resetUserPassword: (userId: string) => Promise<ResetUserPasswordResponse>;
  deleteUserAccount: (userId: string) => Promise<void>;
  adminUpdateUserProfile: (
    userId: string,
    updates: { fullName?: string | null; emailOrPhone?: string; workspaceId?: string | null; role?: UserRole }
  ) => Promise<AdminUserProfileUpdateResponse>;
  adminUpdateUserPassword: (userId: string, newPassword: string) => Promise<void>;
  verifyPassword: (password: string) => Promise<void>;
  applyTeamAccessCode: (code: string) => Promise<AuthUser>;
  selectWorkspace: (workspaceId: string | null, workspaceName?: string | null) => Promise<void>;
  impersonateUser: (userId: string) => Promise<void>;
  endImpersonation: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthSession = {
  token: string;
  user: AuthUser;
};

const ensureDevBusinessTier = (user: AuthUser): AuthUser =>
  user.role === 'dev' && user.businessTier !== 'business'
    ? { ...user, businessTier: 'business' }
    : user;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeWorkspaceName, setActiveWorkspaceName] = useState<string | null>(null);
  const [impersonatorSession, setImpersonatorSession] = useState<AuthSession | null>(null);
  const workspaceScope = useMemo(() => {
    if (!user) {
      return null;
    }
    if (user.role === 'dev') {
      return activeWorkspaceId ?? user.workspaceId ?? null;
    }
    return user.workspaceId ?? null;
  }, [user, activeWorkspaceId]);

  const syncWorkspaceSelection = useCallback(async (nextUser: AuthUser | null) => {
    if (!nextUser) {
      setActiveWorkspaceId(null);
      setActiveWorkspaceName(null);
      await AsyncStorage.multiRemove([DEV_WORKSPACE_KEY, DEV_WORKSPACE_NAME_KEY]);
      return;
    }
    if (nextUser.role === 'dev') {
      const [storedId, storedName] = await Promise.all([
        AsyncStorage.getItem(DEV_WORKSPACE_KEY),
        AsyncStorage.getItem(DEV_WORKSPACE_NAME_KEY),
      ]);
      const normalizedName =
        storedName && storedName.length > 0 ? storedName : nextUser.businessName ?? null;
      setActiveWorkspaceId(storedId ?? nextUser.workspaceId ?? null);
      setActiveWorkspaceName(normalizedName);
    } else {
      setActiveWorkspaceId(nextUser.workspaceId ?? null);
      setActiveWorkspaceName(nextUser.businessName ?? null);
      await AsyncStorage.multiRemove([DEV_WORKSPACE_KEY, DEV_WORKSPACE_NAME_KEY]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const [storedSession, storedImpersonator] = await Promise.all([
          AsyncStorage.getItem(AUTH_STORAGE_KEY),
          AsyncStorage.getItem(IMPERSONATOR_STORAGE_KEY),
        ]);

        if (!cancelled && storedImpersonator) {
          try {
            const parsedImpersonator = JSON.parse(storedImpersonator) as AuthSession;
            if (parsedImpersonator?.token && parsedImpersonator?.user) {
              setImpersonatorSession(parsedImpersonator);
            }
          } catch (error) {
            console.warn('Failed to parse impersonator session', error);
            await AsyncStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
          }
        }

        if (!storedSession) {
          return;
        }
        const parsed = JSON.parse(storedSession) as AuthSession;
        if (!cancelled && parsed?.token && parsed?.user) {
          const storedUser = parsed.user;
          const normalizedUser: AuthUser = {
            id: storedUser.id,
            fullName: storedUser.fullName ?? null,
            emailOrPhone: storedUser.emailOrPhone ?? null,
            role: storedUser.role,
            mustChangePassword: Boolean(storedUser.mustChangePassword),
            businessTier: storedUser.businessTier ?? 'free',
            businessName: storedUser.businessName ?? null,
            workspaceId: storedUser.workspaceId ?? null,
            tokenExpiresAt: storedUser.tokenExpiresAt,
          };
          const adjustedUser = ensureDevBusinessTier(normalizedUser);
          setToken(parsed.token);
          setUser(adjustedUser);
          void syncWorkspaceSelection(adjustedUser);
          await persistSession({ token: parsed.token, user: adjustedUser });
        }
      } catch (error) {
        console.warn('Failed to load auth session', error);
      } finally {
        if (!cancelled) {
          setStatus('ready');
        }
      }
    }
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSession = useCallback(async (session: AuthSession | null) => {
    if (!session) {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  }, []);

  const clearImpersonation = useCallback(async () => {
    setImpersonatorSession(null);
    await AsyncStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const result = await authApi.login(identifier, password);
      await clearImpersonation();
      const normalizedUser = ensureDevBusinessTier(result.user);
      const session: AuthSession = {
        token: result.token,
        user: normalizedUser,
      };
      setToken(session.token);
      setUser(session.user);
      void syncWorkspaceSelection(session.user);
      await persistSession(session);
    },
    [persistSession, syncWorkspaceSelection]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await authApi.registerAccount(input);
      await clearImpersonation();
      const normalizedUser = ensureDevBusinessTier(result.user);
      const session: AuthSession = {
        token: result.token,
        user: normalizedUser,
      };
      setToken(session.token);
      setUser(session.user);
      void syncWorkspaceSelection(session.user);
      await persistSession(session);
    },
    [persistSession, syncWorkspaceSelection]
  );

  const signOut = useCallback(async () => {
    setUser(null);
    setToken(null);
    void syncWorkspaceSelection(null);
    await clearImpersonation();
    await persistSession(null);
  }, [persistSession, syncWorkspaceSelection, clearImpersonation]);

  const createUser = useCallback(
    async (input: CreateUserInput) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      const result = await authApi.createUser(token, input, workspaceScope ?? undefined);
      return result;
    },
    [token, workspaceScope]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      await authApi.changePassword(token, currentPassword, newPassword);
    },
    [token]
  );

  const deleteMyData = useCallback(async () => {
    if (!token) {
      throw new Error('UNAUTHORIZED: Missing token');
    }
    await authApi.deleteMyData(token);
    const updatedUser = user
      ? {
          ...user,
          fullName: null,
        }
      : null;
    setUser(updatedUser);
    if (updatedUser) {
      await persistSession({ token, user: updatedUser });
    }
  }, [token, user, persistSession]);

  const deleteAccount = useCallback(async () => {
    if (!token) {
      throw new Error('UNAUTHORIZED: Missing token');
    }
    await authApi.deleteAccount(token);
    await signOut();
  }, [token, signOut]);

  const getProfile = useCallback(async () => {
    if (!token) {
      throw new Error('UNAUTHORIZED: Missing token');
    }
    return authApi.getMyProfile(token);
  }, [token]);

  const updateProfile = useCallback(
    async (profile: {
      fullName?: string | null;
      emailOrPhone?: string;
      businessName?: string | null;
    }) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      const updated = await authApi.updateMyProfile(token, profile);
      const nextUser = user
        ? ensureDevBusinessTier({
            ...user,
            fullName: updated.fullName,
            emailOrPhone: updated.emailOrPhone,
            businessName: updated.businessName,
            businessTier: updated.businessTier ?? user.businessTier,
          })
        : null;
      setUser(nextUser);
      if (nextUser) {
        await persistSession({ token, user: nextUser });
      }
      return updated;
    },
    [token, user, persistSession]
  );

  const resetUserPassword = useCallback(
    async (userId: string) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      return authApi.resetUserPassword(token, userId, workspaceScope ?? undefined);
    },
    [token, workspaceScope]
  );

  const deleteUserAccount = useCallback(
    async (userId: string) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      await authApi.deleteUserAccount(token, userId, workspaceScope ?? undefined);
    },
    [token, workspaceScope]
  );

  const adminUpdateUserProfile = useCallback(
    async (
      userId: string,
      updates: { fullName?: string | null; emailOrPhone?: string; workspaceId?: string | null }
    ) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      return authApi.adminUpdateUserProfile(token, userId, updates, workspaceScope ?? undefined);
    },
    [token, workspaceScope]
  );

  const adminUpdateUserPassword = useCallback(
    async (userId: string, newPassword: string) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      await authApi.adminUpdateUserPassword(token, userId, newPassword, workspaceScope ?? undefined);
    },
    [token, workspaceScope]
  );

  const verifyPassword = useCallback(
    async (password: string) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      await authApi.verifyPassword(token, password);
    },
    [token]
  );

  const applyTeamAccessCode = useCallback(
    async (code: string) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      const result = await authApi.applyTeamAccessCode(token, code);
      const normalizedUser = ensureDevBusinessTier(result.user);
      const session: AuthSession = {
        token: result.token,
        user: normalizedUser,
      };
      setToken(session.token);
      setUser(session.user);
      void syncWorkspaceSelection(session.user);
      await persistSession(session);
      return session.user;
    },
    [token, persistSession, syncWorkspaceSelection]
  );

  const impersonateUserAccount = useCallback(
    async (targetUserId: string) => {
      if (!token || !user) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      if (user.role !== 'dev') {
        throw new Error('FORBIDDEN: Developer permissions required.');
      }
      if (impersonatorSession) {
        throw new Error('Return to your developer session before impersonating another user.');
      }
      if (user.id === targetUserId) {
        return;
      }
      const result = await authApi.impersonateUser(token, targetUserId);
      const normalizedUser = ensureDevBusinessTier(result.user);
      const nextSession: AuthSession = {
        token: result.token,
        user: normalizedUser,
      };
      const baseSession: AuthSession = {
        token,
        user,
      };
      setImpersonatorSession(baseSession);
      await AsyncStorage.setItem(IMPERSONATOR_STORAGE_KEY, JSON.stringify(baseSession));
      setToken(nextSession.token);
      setUser(nextSession.user);
      void syncWorkspaceSelection(nextSession.user);
      await persistSession(nextSession);
    },
    [token, user, impersonatorSession, persistSession, syncWorkspaceSelection]
  );

  const endImpersonation = useCallback(async () => {
    if (!impersonatorSession) {
      return;
    }
    setToken(impersonatorSession.token);
    setUser(impersonatorSession.user);
    void syncWorkspaceSelection(impersonatorSession.user);
    await persistSession(impersonatorSession);
    setImpersonatorSession(null);
    await AsyncStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
  }, [impersonatorSession, persistSession, syncWorkspaceSelection]);

  const selectWorkspace = useCallback(
    async (workspaceId: string | null, workspaceName?: string | null) => {
      if (user?.role !== 'dev') {
        return;
      }
      const normalizedName =
        workspaceName && workspaceName.trim().length > 0 ? workspaceName.trim() : null;
      setActiveWorkspaceId(workspaceId);
      setActiveWorkspaceName(normalizedName);
      if (workspaceId) {
        await AsyncStorage.setItem(DEV_WORKSPACE_KEY, workspaceId);
        await AsyncStorage.setItem(DEV_WORKSPACE_NAME_KEY, normalizedName ?? '');
      } else {
        await AsyncStorage.multiRemove([DEV_WORKSPACE_KEY, DEV_WORKSPACE_NAME_KEY]);
      }
    },
    [user?.role]
  );

  const effectiveWorkspaceName = useMemo(() => {
    if (!user) {
      return null;
    }
    if (user.role === 'dev') {
      return activeWorkspaceName;
    }
    return user.businessName ?? activeWorkspaceName ?? null;
  }, [user, activeWorkspaceName]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      workspaceId: workspaceScope,
      workspaceName: effectiveWorkspaceName,
      impersonatorSession,
      isImpersonating: Boolean(impersonatorSession),
      signIn,
      register,
      signOut,
      createUser,
      changePassword,
      deleteMyData,
      deleteAccount,
      getProfile,
      updateProfile,
      resetUserPassword,
      deleteUserAccount,
      adminUpdateUserProfile,
      adminUpdateUserPassword,
      verifyPassword,
      applyTeamAccessCode,
      selectWorkspace,
      impersonateUser: impersonateUserAccount,
      endImpersonation,
    }),
    [
      user,
      token,
      status,
      workspaceScope,
      effectiveWorkspaceName,
      signIn,
      register,
      signOut,
      createUser,
      changePassword,
      deleteMyData,
      deleteAccount,
      getProfile,
      updateProfile,
      resetUserPassword,
      deleteUserAccount,
      adminUpdateUserProfile,
      adminUpdateUserPassword,
      verifyPassword,
      applyTeamAccessCode,
      selectWorkspace,
      impersonatorSession,
      impersonateUserAccount,
      endImpersonation,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
