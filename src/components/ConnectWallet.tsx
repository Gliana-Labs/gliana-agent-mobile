import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useWallet } from '../lib/mwa';
import { colors, font, radius, space } from '../theme';
import { WalletIcon } from './icons';

/**
 * `pixel` restyles it for the map's HUD: square corners, 2px border, pixel
 * type. Same behaviour — a wallet chip that looks like a game panel on the map
 * and like a system control everywhere else.
 */
export function ConnectWallet({ pixel = false }: { pixel?: boolean } = {}) {
  const { account, connect, connecting, disconnect } = useWallet();

  async function onPress() {
    if (account) {
      Alert.alert('Wallet', `${account.label ?? 'Connected'}\n${account.address}`, [
        { text: 'Disconnect', style: 'destructive', onPress: disconnect },
        { text: 'Close', style: 'cancel' },
      ]);
      return;
    }
    try {
      await connect();
    } catch (e) {
      Alert.alert(
        'Could not connect',
        e instanceof Error && /No installed wallet|not found|no wallet/i.test(e.message)
          ? 'No Solana wallet app found. Install Phantom, Solflare, or Backpack and try again.'
          : e instanceof Error
            ? e.message
            : 'Try again.',
      );
    }
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.btn, account ? styles.connected : styles.idle, pixel && styles.pixel]}
    >
      {connecting ? (
        <ActivityIndicator size="small" color={colors.flameSoft} />
      ) : (
        <>
          <WalletIcon size={14} color={account ? colors.green : colors.flameSoft} />
          <Text style={[styles.text, account ? styles.textConnected : styles.textIdle, pixel && styles.pixelText]}>
            {account ? `${account.address.slice(0, 4)}…${account.address.slice(-4)}` : 'Connect'}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  idle: { borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.08)' },
  connected: { borderColor: 'rgba(52,211,153,0.4)', backgroundColor: 'rgba(52,211,153,0.08)' },
  pixel: { borderRadius: 4, borderWidth: 2, paddingVertical: space(2.5) },
  pixelText: { fontSize: 9, fontFamily: font.pixel, fontWeight: '400' },
  text: { fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  textIdle: { color: colors.flameSoft },
  textConnected: { color: colors.green },
});
