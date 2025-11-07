import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as authApi from './api';
import type { AuthUser, CreateUserInput, CreateUserResponse } from './types';

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

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, status, signIn, signOut, createUser, changePassword }),
    [user, token, status, signIn, signOut, createUser, changePassword]
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
