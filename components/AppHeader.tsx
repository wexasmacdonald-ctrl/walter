import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/auth-context';
import { useTheme } from '@/features/theme/theme-context';

type AppHeaderProps = {
  rightSlot?: ReactNode;
  showDivider?: boolean;
};

export function AppHeader({ rightSlot, showDivider = true }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { user, isImpersonating, endImpersonation } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogoPress = () => {
    if (!user) {
      router.replace('/');
      return;
    }
    if (!pathname || pathname === '/') {
      return;
    }
    router.replace('/');
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: showDivider ? colors.border : 'transparent',
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go to home"
        onPress={handleLogoPress}
        style={({ pressed }) => [styles.logoButton, pressed && styles.logoButtonPressed]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Image
          source={require('@/assets/images/blow-grid logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Pressable>
      <View style={styles.spacer} />
      <View style={styles.actionRow}>
        {isImpersonating ? (
          <View style={styles.impersonationChip}>
            <Text style={styles.impersonationLabel}>
              Viewing as {user?.fullName || user?.emailOrPhone || 'user'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void endImpersonation();
              }}
              style={({ pressed }) => [
                styles.returnButton,
                pressed && styles.returnButtonPressed,
              ]}
            >
              <Text style={styles.returnButtonText}>Return to dev</Text>
            </Pressable>
          </View>
        ) : null}
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      minHeight: 46,
    },
    logoButton: {
      width: 64,
      height: 64,
      padding: 0,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 8,
    },
    logoButtonPressed: {
      opacity: 0.8,
    },
    logo: {
      width: 96,
      height: 96,
    },
    spacer: {
      flex: 1,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rightSlot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    impersonationChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
    },
    impersonationLabel: {
      color: colors.text,
      fontSize: 12,
    },
    returnButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 4,
      backgroundColor: colors.primary,
    },
    returnButtonPressed: {
      opacity: 0.85,
    },
    returnButtonText: {
      color: colors.surface,
      fontWeight: '600',
      fontSize: 12,
    },
  });
}
