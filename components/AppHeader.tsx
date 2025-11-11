import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/features/theme/theme-context';

type AppHeaderProps = {
  rightSlot?: ReactNode;
  showDivider?: boolean;
};

export function AppHeader({ rightSlot, showDivider = true }: AppHeaderProps) {
  const router = useRouter();
  const { colors } = useTheme();

  const handleLogoPress = () => {
    router.push('/');
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
        <View
          style={[
            styles.logoGlow,
            {
              shadowColor: 'rgba(255, 255, 255, 0.85)',
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View pointerEvents="none" style={styles.logoHalo} />
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
        </View>
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
    overflow: 'hidden',
  },
  logoButton: {
    padding: 4,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  logoButtonPressed: {
    opacity: 0.8,
  },
  logoGlow: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 18,
    overflow: 'hidden',
  },
  logoHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    opacity: 0.9,
  },
  logo: {
    width: 58,
    height: 58,
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
