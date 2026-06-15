/**
 * Ambient backdrop — ports the web app's `app-grid` (faint grid) + `app-glow`
 * (warm radial) using react-native-svg. A plain RN View can't render a soft
 * radial (no blur), so we use an SVG RadialGradient that actually fades to
 * transparent, plus a low-opacity grid pattern. Sits behind everything.
 */
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Line, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

export function Backdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          {/* Warm amber glow, anchored top-right (behind the header / Connect). */}
          <RadialGradient id="glow" cx="82%" cy="2%" rx="70%" ry="48%" gradientUnits="userSpaceOnUse"
            fx="82%" fy="2%">
            <Stop offset="0" stopColor="#f59e0b" stopOpacity="0.16" />
            <Stop offset="0.55" stopColor="#ea580c" stopOpacity="0.05" />
            <Stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </RadialGradient>
          {/* Second, cooler rose glow low-left for depth (matches web app-glow). */}
          <RadialGradient id="glow2" cx="8%" cy="92%" rx="60%" ry="40%" gradientUnits="userSpaceOnUse"
            fx="8%" fy="92%">
            <Stop offset="0" stopColor="#fb7185" stopOpacity="0.07" />
            <Stop offset="1" stopColor="#fb7185" stopOpacity="0" />
          </RadialGradient>
          {/* Faint grid. */}
          <Pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2="44" y2="0" stroke="#ffffff" strokeOpacity="0.025" strokeWidth="1" />
            <Line x1="0" y1="0" x2="0" y2="44" stroke="#ffffff" strokeOpacity="0.025" strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#grid)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow2)" />
      </Svg>
    </View>
  );
}
