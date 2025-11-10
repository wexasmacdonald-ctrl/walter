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
} from './types';

const AUTH_STORAGE_KEY = 'auth/session';

type AuthStatus = 'loading' | 'ready';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  createUser: (input: CreateUserInput) => Promise<CreateUserResponse>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteMyData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  getProfile: () => Promise<AccountProfile>;
  updateProfile: (profile: { fullName?: string | null; emailOrPhone?: string }) => Promise<AccountProfile>;
  resetUserPassword: (userId: string) => Promise<ResetUserPasswordResponse>;
  deleteUserAccount: (userId: string) => Promise<void>;
  adminUpdateUserProfile: (
    userId: string,
    updates: { fullName?: string | null; emailOrPhone?: string }
  ) => Promise<AdminUserProfileUpdateResponse>;
  adminUpdateUserPassword: (userId: string, newPassword: string) => Promise<void>;
  verifyPassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthSession = {
  token: string;
  user: AuthUser;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

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
          setToken(parsed.token);
          setUser(parsed.user);
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
      const session: AuthSession = {
        token: result.token,
        user: result.user,
      };
      setToken(session.token);
      setUser(session.user);
      await persistSession(session);
    },
    [persistSession]
  );

  const signOut = useCallback(async () => {
    setUser(null);
    setToken(null);
    await persistSession(null);
  }, [persistSession]);

  const createUser = useCallback(
    async (input: CreateUserInput) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      const result = await authApi.createUser(token, input);
      return result;
    },
    [token]
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
    async (profile: { fullName?: string | null; emailOrPhone?: string }) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      const updated = await authApi.updateMyProfile(token, profile);
      const nextUser = user
        ? {
            ...user,
            fullName: updated.fullName,
            emailOrPhone: updated.emailOrPhone,
          }
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
      return authApi.resetUserPassword(token, userId);
    },
    [token]
  );

  const deleteUserAccount = useCallback(
    async (userId: string) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      await authApi.deleteUserAccount(token, userId);
    },
    [token]
  );

  const adminUpdateUserProfile = useCallback(
    async (userId: string, updates: { fullName?: string | null; emailOrPhone?: string }) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      return authApi.adminUpdateUserProfile(token, userId, updates);
    },
    [token]
  );

  const adminUpdateUserPassword = useCallback(
    async (userId: string, newPassword: string) => {
      if (!token) {
        throw new Error('UNAUTHORIZED: Missing token');
      }
      await authApi.adminUpdateUserPassword(token, userId, newPassword);
    },
    [token]
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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      signIn,
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
    }),
    [
      user,
      token,
      status,
      signIn,
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
