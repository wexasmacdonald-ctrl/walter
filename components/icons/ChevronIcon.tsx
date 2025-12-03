import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type ChevronIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  rotation?: number;
};

export function ChevronIcon({
  size = 18,
  color = '#9CA3AF',
  strokeWidth = 2,
  style,
  rotation = 0,
}: ChevronIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}
      fill="none"
    >
      <Path
        d="M5 8.5 10 13l5-4.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
