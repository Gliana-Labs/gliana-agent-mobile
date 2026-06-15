import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

type P = { size?: number; color?: string };
const base = (color?: string) => color ?? colors.textDim;

export const MenuIcon = ({ size = 20, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill={base(color)}>
    <Path d="M1.75 3.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H1.75Zm0 3.75a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H1.75Zm0 3.75a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H1.75Z" />
  </Svg>
);

export const PlusIcon = ({ size = 18, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={base(color)} strokeWidth={2} strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

export const SendIcon = ({ size = 18, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={base(color)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
  </Svg>
);

export const TrashIcon = ({ size = 16, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={base(color)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </Svg>
);

export const WalletIcon = ({ size = 16, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={base(color)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    <Path d="M16 12h.01M3 9h18" />
  </Svg>
);

export const DownloadIcon = ({ size = 16, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={base(color)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Svg>
);

export const PlayIcon = ({ size = 18, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={base(color)}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

export const PauseIcon = ({ size = 18, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={base(color)}>
    <Path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </Svg>
);
