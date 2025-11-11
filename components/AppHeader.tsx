import { useRef, type ReactNode } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/features/theme/theme-context';

type AppHeaderProps = {
  rightSlot?: ReactNode;
  showDivider?: boolean;
};

export function AppHeader({ rightSlot, showDivider = true }: AppHeaderProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const animatingRef = useRef(false);

  const handleLogoPress = () => {
    if (animatingRef.current) {
      return;
    }
    animatingRef.current = true;

    scaleAnim.setValue(1);
    spinAnim.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1.12,
          duration: 130,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 130,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          mass: 0.6,
          damping: 5,
          stiffness: 140,
          useNativeDriver: true,
        }),
        Animated.timing(spinAnim, {
          toValue: 2,
          duration: 180,
          easing: Easing.out(Easing.circle),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      spinAnim.setValue(0);
      animatingRef.current = false;
      router.push('/');
    });
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
        <Animated.View
          style={[
            styles.logoAnimatedWrapper,
            {
              transform: [
                { scale: scaleAnim },
                {
                  rotate: spinAnim.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: ['0deg', '10deg', '-6deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
        </Animated.View>
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
  logoAnimatedWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
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
