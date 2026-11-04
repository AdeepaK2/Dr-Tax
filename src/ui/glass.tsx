import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { glassShadow, tint, useColors } from './theme';

const GLOWS = [
  { id: 'teal', color: '#5EEAD4', cx: '8%', cy: '6%', r: 240, opacity: 0.55 },
  { id: 'violet', color: '#A78BFA', cx: '100%', cy: '28%', r: 260, opacity: 0.42 },
  { id: 'peach', color: '#FDBA74', cx: '0%', cy: '70%', r: 250, opacity: 0.38 },
  { id: 'sky', color: '#7DD3FC', cx: '95%', cy: '96%', r: 230, opacity: 0.45 },
];

/** Fixed pastel background with soft colour glows. Glass cards scroll over it. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#EEF2FF', '#F6F3FF', '#EEFBF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          {GLOWS.map((g) => (
            <RadialGradient key={g.id} id={g.id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
              <Stop offset="1" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {GLOWS.map((g) => (
          <Circle key={g.id} cx={g.cx} cy={g.cy} r={g.r} fill={`url(#${g.id})`} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * Frosted-glass surface: translucent white, bright edge, diagonal sheen.
 * `tintColor` washes it with a faint colour (used for hero cards).
 */
export function Glass({
  children,
  style,
  strong,
  tintColor,
  radius = 22,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
  tintColor?: string;
  radius?: number;
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          borderRadius: radius,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: strong ? c.cardStrong : c.card,
          boxShadow: glassShadow,
        },
        style,
      ]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        {tintColor ? (
          <LinearGradient colors={[tint(tintColor, 0.22), tint(tintColor, 0.04)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : null}
        <LinearGradient
          colors={['rgba(255,255,255,0.70)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.0)']}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {children}
    </View>
  );
}

/** Material icon (Android). */
export function Icon({ name, size = 20, color }: { name: AndroidSymbol; size?: number; color?: string }) {
  const c = useColors();
  return <SymbolView name={{ android: name, ios: 'circle' }} size={size} tintColor={color ?? c.text} />;
}

/** Round tinted badge with an icon, used for categories and stats. */
export function IconBadge({ name, color, size = 40 }: { name: AndroidSymbol; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint(color, 0.16),
        borderWidth: 1,
        borderColor: tint(color, 0.28),
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/** Frosted strip behind the status bar, so scrolled content never clashes with the clock. */
export function StatusBarGlass() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: 'rgba(240,243,255,0.92)',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.9)',
      }}
    />
  );
}
