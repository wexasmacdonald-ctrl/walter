import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { AuthProvider } from '@/features/auth/auth-context';
import { ThemeProvider, useTheme } from '@/features/theme/theme-context';
import { AppHeader } from '@/components/AppHeader';

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <NavigationBridge />
      </ThemeProvider>
    </AuthProvider>
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
