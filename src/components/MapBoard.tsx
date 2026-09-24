/**
 * The map — the app as three places on a route.
 *
 * A game map, not a menu: a grid field, a dashed path, and nodes you travel to.
 * The Arena node is the only one that carries live state (today's countdown and
 * entry count), because it is the only one with a deadline.
 *
 * Built from react-native-svg for the field and the path, with the nodes as
 * real Pressables on top rather than SVG shapes — a tappable target has to be
 * 44px and has to press like a button, and an SVG rect does neither for free.
 */
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path as SvgPath, Rect } from 'react-native-svg';
import { colors, font, space } from '../theme';
import { Press } from './arena/bits';

export interface MapNode {
  id: string;
  label: string;
  glyph: string;
  /** Position as a fraction of the board, 0–1. */
  x: number;
  y: number;
  /** One live line under the label, when the node has something to say. */
  status?: string;
  live?: boolean;
  onPress: () => void;
}

const BOARD_HEIGHT = 300;
const NODE = 76;

export function MapBoard({ nodes }: { nodes: MapNode[] }) {
  const { width } = useWindowDimensions();
  const boardWidth = width - space(5) * 2;
  const at = (n: MapNode) => ({ x: n.x * boardWidth, y: n.y * BOARD_HEIGHT });

  // The route, drawn through the nodes in order.
  const route = nodes
    .map((n, i) => {
      const p = at(n);
      return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <View style={[styles.board, { height: BOARD_HEIGHT }]}>
      <Svg width={boardWidth} height={BOARD_HEIGHT} style={StyleSheet.absoluteFill}>
        {/* The field: a 24px grid, faint enough to be ground rather than pattern. */}
        {Array.from({ length: Math.ceil(boardWidth / 24) }).map((_, i) => (
          <Line key={`v${i}`} x1={i * 24} y1={0} x2={i * 24} y2={BOARD_HEIGHT} stroke="rgba(255,255,255,0.035)" strokeWidth={1} />
        ))}
        {Array.from({ length: Math.ceil(BOARD_HEIGHT / 24) }).map((_, i) => (
          <Line key={`h${i}`} x1={0} y1={i * 24} x2={boardWidth} y2={i * 24} stroke="rgba(255,255,255,0.035)" strokeWidth={1} />
        ))}
        {/* The route between places. Dashed, because a path you have not walked
            is a suggestion, not a wall. */}
        <SvgPath d={route} stroke="rgba(245,158,11,0.45)" strokeWidth={3} strokeDasharray="6 8" fill="none" />
        <Rect x={1} y={1} width={boardWidth - 2} height={BOARD_HEIGHT - 2} stroke={colors.border} strokeWidth={2} fill="none" />
      </Svg>

      {nodes.map((n) => {
        const p = at(n);
        return (
          <Press
            key={n.id}
            onPress={n.onPress}
            style={[styles.node, { left: p.x - NODE / 2, top: p.y - NODE / 2 }, n.live && styles.nodeLive]}
          >
            <Text style={styles.glyph}>{n.glyph}</Text>
            {n.live ? <View style={styles.dot} /> : null}
          </Press>
        );
      })}

      {nodes.map((n) => {
        const p = at(n);
        return (
          <View key={`${n.id}-label`} style={[styles.labelWrap, { left: p.x - 80, top: p.y + NODE / 2 + 6 }]} pointerEvents="none">
            <Text style={styles.label}>{n.label}</Text>
            {n.status ? <Text style={styles.status}>{n.status}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { marginTop: space(5), marginBottom: space(4) },
  node: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.ink2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLive: {
    borderColor: colors.flame,
    backgroundColor: 'rgba(245,158,11,0.12)',
    // The hard bottom edge again: depth without a blur.
    borderBottomWidth: 4,
    borderBottomColor: colors.flameDeep,
  },
  glyph: { fontSize: 26, color: colors.flameSoft },
  dot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, backgroundColor: colors.green },
  labelWrap: { position: 'absolute', width: 160, alignItems: 'center' },
  label: { color: colors.text, fontSize: 8, fontFamily: font.pixel, letterSpacing: 1 },
  status: { color: colors.textDim, fontSize: 11, marginTop: 4 },
});
