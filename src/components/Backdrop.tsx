/**
 * Ambient backdrop — ports the web app's `app-grid` (faint grid) + `app-glow`
 * (warm radial). A plain RN View can't render a soft radial (no blur), and
 * react-native-svg's <Pattern> is unreliable across devices, so we draw the
 * grid as explicit <Line>s and the glow as an SVG RadialGradient. Behind all.
 */
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';

const GAP = 40; // grid spacing (px)

export function Backdrop() {
  const { width, height } = useWindowDimensions();
  const cols = Math.ceil(width / GAP);
  const rows = Math.ceil(height / GAP);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="glow" cx="82%" cy="3%" rx="72%" ry="46%" fx="82%" fy="3%" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#f59e0b" stopOpacity="0.18" />
            <Stop offset="0.55" stopColor="#ea580c" stopOpacity="0.05" />
            <Stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glow2" cx="6%" cy="94%" rx="62%" ry="40%" fx="6%" fy="94%" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#fb7185" stopOpacity="0.08" />
            <Stop offset="1" stopColor="#fb7185" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Grid — drawn explicitly so it renders on every device. */}
        {Array.from({ length: cols + 1 }, (_, i) => (
          <Line key={`v${i}`} x1={i * GAP} y1={0} x2={i * GAP} y2={height} stroke="#ffffff" strokeOpacity={0.04} strokeWidth={1} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <Line key={`h${i}`} x1={0} y1={i * GAP} x2={width} y2={i * GAP} stroke="#ffffff" strokeOpacity={0.04} strokeWidth={1} />
        ))}

        {/* Glows on top of the grid (tint it, like the web app-glow). */}
        <Rect x={0} y={0} width={width} height={height} fill="url(#glow)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#glow2)" />
      </Svg>
    </View>
  );
}
