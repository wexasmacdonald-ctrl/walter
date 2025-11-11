import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { AuthProvider } from '@/features/auth/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemeProvider, useTheme } from '@/features/theme/theme-context';
import { AppHeader } from '@/components/AppHeader';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider>
        <NavigationThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <GlobalScreenWrapper>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="legal/[doc]" />
            </Stack>
          </GlobalScreenWrapper>
          <StatusBar style="auto" />
        </NavigationThemeProvider>
      </ThemeProvider>
    </AuthProvider>
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
