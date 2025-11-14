import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
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
  const { user } = useAuth();

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
        <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
      </Pressable>
      <View style={styles.spacer} />
      {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    resizeMode: 'contain',
  },
  spacer: {
    flex: 1,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
