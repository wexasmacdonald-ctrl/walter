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
} from './types';

const AUTH_STORAGE_KEY = 'auth/session';
const DEV_WORKSPACE_KEY = 'auth/dev-workspace';

type AuthStatus = 'loading' | 'ready';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  workspaceId: string | null;
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
    updates: { fullName?: string | null; emailOrPhone?: string; workspaceId?: string | null }
  ) => Promise<AdminUserProfileUpdateResponse>;
  adminUpdateUserPassword: (userId: string, newPassword: string) => Promise<void>;
  verifyPassword: (password: string) => Promise<void>;
  applyTeamAccessCode: (code: string) => Promise<AuthUser>;
  selectWorkspace: (workspaceId: string | null) => Promise<void>;
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
      await AsyncStorage.removeItem(DEV_WORKSPACE_KEY);
      return;
    }
    if (nextUser.role === 'dev') {
      const stored = await AsyncStorage.getItem(DEV_WORKSPACE_KEY);
      setActiveWorkspaceId(stored ?? nextUser.workspaceId ?? null);
    } else {
      setActiveWorkspaceId(nextUser.workspaceId ?? null);
      await AsyncStorage.removeItem(DEV_WORKSPACE_KEY);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!stored) {
          return;
        }
        const parsed = JSON.parse(stored) as AuthSession;
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

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const result = await authApi.login(identifier, password);
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
    await persistSession(null);
  }, [persistSession, syncWorkspaceSelection]);

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

  const selectWorkspace = useCallback(
    async (workspaceId: string | null) => {
      if (user?.role !== 'dev') {
        return;
      }
      setActiveWorkspaceId(workspaceId);
      if (workspaceId) {
        await AsyncStorage.setItem(DEV_WORKSPACE_KEY, workspaceId);
      } else {
        await AsyncStorage.removeItem(DEV_WORKSPACE_KEY);
      }
    },
    [user?.role]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      workspaceId: workspaceScope,
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
    }),
    [
      user,
      token,
      status,
      workspaceScope,
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
