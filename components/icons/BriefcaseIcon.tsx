import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

type BriefcaseIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export function BriefcaseIcon({
  size = 18,
  color = '#9CA3AF',
  strokeWidth = 1.7,
  style,
}: BriefcaseIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} fill="none">
      <Rect
        x={4}
        y={7}
        width={16}
        height={11}
        rx={2}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path
        d="M9 7V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V7M4 12h16"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11 12v1.5c0 .276.224.5.5.5h1c.276 0 .5-.224.5-.5V12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
