import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text, View } from 'react-native';

import { AuthProvider } from '@/features/auth/auth-context';
import { ThemeProvider, useTheme } from '@/features/theme/theme-context';
import { AppHeader } from '@/components/AppHeader';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider>
            <NavigationBridge />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function NavigationBridge() {
  const { theme, colors } = useTheme();
  const navigationTheme = useMemo(() => {
    const base = theme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.surface,
        border: colors.border,
        text: colors.text,
        primary: colors.primary,
      },
    };
  }, [theme, colors]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <GlobalScreenWrapper>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="legal/[doc]" />
        </Stack>
        <DevErrorOverlay />
      </GlobalScreenWrapper>
      <StatusBarController />
    </NavigationThemeProvider>
  );
}

function GlobalScreenWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { colors } = useTheme();
  const isHome = !pathname || pathname === '/';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {!isHome ? (
        <SafeAreaView
          edges={['top', 'left', 'right']}
          style={{ backgroundColor: colors.surface }}
        >
          <AppHeader />
        </SafeAreaView>
      ) : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function StatusBarController() {
  const { isDark, colors } = useTheme();
  return (
    <StatusBar
      style={isDark ? 'light' : 'dark'}
      backgroundColor={colors.background}
      translucent={false}
    />
  );
}

function DevErrorOverlay() {
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const previousHandler =
      typeof ErrorUtils !== 'undefined' && typeof ErrorUtils.getGlobalHandler === 'function'
        ? ErrorUtils.getGlobalHandler()
        : null;
    const handler = (err: unknown, isFatal?: boolean) => {
      if (err instanceof Error) {
        setError(err.stack ?? err.message);
      } else {
        setError(String(err));
      }
      previousHandler?.(err as Error, isFatal);
    };
    if (typeof ErrorUtils !== 'undefined' && typeof ErrorUtils.setGlobalHandler === 'function') {
      ErrorUtils.setGlobalHandler(handler);
    }
    return () => {
      if (previousHandler && typeof ErrorUtils !== 'undefined' && typeof ErrorUtils.setGlobalHandler === 'function') {
        ErrorUtils.setGlobalHandler(previousHandler);
      }
    };
  }, []);

  if (!__DEV__ || !error) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: 'rgba(248,113,113,0.9)',
      }}
    >
      <Text style={{ color: colors.surface, fontWeight: '700', marginBottom: 6 }}>Dev runtime error</Text>
      <Text style={{ color: colors.surface, fontSize: 12 }} numberOfLines={6}>
        {error}
      </Text>
    </View>
  );
}
