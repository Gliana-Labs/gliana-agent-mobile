/**
 * Solana Mobile Wallet Adapter (MWA) integration — Android only.
 *
 * Replaces the web app's wallet-standard (@solana/react) layer. A user opens
 * their installed Solana wallet (Phantom, Solflare, Backpack…) through MWA's
 * `transact` session; we `authorize` once, keep the auth token, and `reauthorize`
 * for each signing session.
 *
 * The payment layer (lib/pay.ts) reuses the SAME tested @solana/mpp `charge`
 * logic as the web app — it just needs a @solana/kit signer. We build a
 * `TransactionPartialSigner` whose `signTransactions` serializes each kit
 * transaction to a base64 wire transaction, hands it to MWA `signTransactions`
 * (the wallet signs; the gateway broadcasts), then decodes the returned signed
 * wire transaction to extract our signature. No private key ever leaves the wallet.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { transact, type AuthorizationResult } from '@solana-mobile/mobile-wallet-adapter-protocol';
import {
  address,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  type Address,
  type SignatureDictionary,
  type Transaction,
  type TransactionPartialSigner,
} from '@solana/kit';
import { Buffer } from 'buffer';
import { loadWallet, saveWallet } from './storage';

const APP_IDENTITY = {
  name: 'Gliana Agent',
  uri: 'https://agent.glianalabs.com',
  // Relative to `uri` → https://agent.glianalabs.com/icon-512.png. A PNG (not
  // .ico) so the wallet's approval sheet can actually render the app icon.
  icon: 'icon-512.png',
};

const CHAIN = 'solana:mainnet' as const;

export interface WalletAccount {
  /** base58 address (kit/web3 form) */
  address: string;
  label?: string;
}

/** base64 (MWA wire form) → base58 (kit/web3 form). */
function base64ToBase58(b64: string): string {
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  return getBase58Decoder().decode(bytes);
}

/**
 * A kit signer that can ALSO sign a raw wire transaction.
 *
 * Both paths exist because wallets re-serialize before signing: @solana/mpp
 * wants a kit signer, while anything we submit ourselves must send the wallet's
 * own bytes back verbatim or the signature does not verify.
 */
export type WalletSigner = TransactionPartialSigner & {
  signWireTransaction(unsignedWireB64: string): Promise<string>;
};

interface WalletState {
  account: WalletAccount | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** kit signer for @solana/mpp and the Arena — null until connected. */
  signer: WalletSigner | null;
}

const Ctx = createContext<WalletState>({
  account: null,
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
  signer: null,
});

export const useWallet = () => useContext(Ctx);

function pickAccount(result: AuthorizationResult): WalletAccount {
  const acc = result.accounts[0];
  return { address: base64ToBase58(acc.address), label: acc.label };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  /**
   * Restore the session on launch.
   *
   * The token is only a handle: every signing session still calls `reauthorize`
   * against the wallet, so a revoked or expired token fails there and the user
   * reconnects. Restoring it just means they do not have to do that to READ
   * their own balance and history.
   */
  useEffect(() => {
    let alive = true;
    void loadWallet().then((w) => {
      if (!alive || !w) return;
      setAccount({ address: w.address, label: w.label });
      setAuthToken(w.authToken);
    });
    return () => {
      alive = false;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { acct, token } = await transact(async (wallet) => {
        const result = await wallet.authorize({ chain: CHAIN, identity: APP_IDENTITY });
        return { acct: pickAccount(result), token: result.auth_token };
      });
      setAccount(acct);
      setAuthToken(token);
      void saveWallet({ address: acct.address, label: acct.label, authToken: token });
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    const token = authToken;
    setAccount(null);
    setAuthToken(null);
    void saveWallet(null);
    if (token) {
      // Best-effort revoke; ignore failures (e.g. wallet not reachable).
      transact(async (wallet) => wallet.deauthorize({ auth_token: token })).catch(() => {});
    }
  }, [authToken]);

  /**
   * Start a signing session, repairing a dead authorization rather than failing.
   *
   * A stored auth token is a HANDLE the wallet can forget — it expires, the user
   * revokes it, or (this one, repeatedly, today) the app is reinstalled. Before
   * the session was persisted this barely mattered, because a token only ever
   * existed moments after a successful authorize. Restoring one across restarts
   * made the stale case ordinary, and it surfaced as the wallet's own words:
   * "-1/authorization request failed", mid-payment, with no way forward.
   *
   * So a failed reauthorize falls back to a full authorize INSIDE the same
   * session: one wallet round trip, no second prompt for the user, and the new
   * token is kept. The only cost is that the wallet may ask them to approve the
   * app again, which is exactly what a revoked authorization should do.
   */
  const authorizeIn = useCallback(
    async (wallet: Parameters<Parameters<typeof transact>[0]>[0], token: string): Promise<string> => {
      try {
        const res = (await wallet.reauthorize({ auth_token: token, identity: APP_IDENTITY })) as
          | { auth_token?: string }
          | undefined;
        // Wallets may rotate the token on reauthorize; keep whatever came back.
        return res?.auth_token ?? token;
      } catch {
        const fresh = await wallet.authorize({ chain: CHAIN, identity: APP_IDENTITY });
        return fresh.auth_token;
      }
    },
    [],
  );

  /** Persist a token the wallet handed back, when it differs from the one we held. */
  const rememberToken = useCallback(
    (next: string) => {
      if (!account || next === authToken) return;
      setAuthToken(next);
      void saveWallet({ address: account.address, label: account.label, authToken: next });
    },
    [account, authToken],
  );

  // A kit partial signer that routes signing through MWA. Rebuilt when the
  // connected account / auth token changes.
  const signer = useMemo<WalletSigner | null>(() => {
    if (!account || !authToken) return null;
    const addr = address(account.address);
    return {
      address: addr,
      // Preferred path (see the @solana/mpp client patch): hand the wallet the
      // unsigned wire transaction and submit ITS signed bytes verbatim. Wallets
      // re-serialize before signing, so a signature extracted from their bytes
      // does not verify over ours ("SignatureFailure" at the gateway).
      async signWireTransaction(unsignedWireB64: string): Promise<string> {
        let issued = authToken;
        const { signed_payloads } = await transact(async (wallet) => {
          issued = await authorizeIn(wallet, authToken);
          return wallet.signTransactions({ payloads: [unsignedWireB64] });
        });
        rememberToken(issued);
        if (!signed_payloads?.[0]) throw new Error('Wallet returned no signed transaction');
        return signed_payloads[0];
      },
      async signTransactions(
        transactions: readonly Transaction[],
      ): Promise<readonly SignatureDictionary[]> {
        const payloads = transactions.map((tx) => getBase64EncodedWireTransaction(tx));
        let issued = authToken;
        const { signed_payloads } = await transact(async (wallet) => {
          // Reuse the existing authorization, or repair it — see authorizeIn.
          issued = await authorizeIn(wallet, authToken);
          return wallet.signTransactions({ payloads });
        });
        rememberToken(issued);
        const decoder = getTransactionDecoder();
        return signed_payloads.map((b64: string) => {
          const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
          const decoded = decoder.decode(bytes);
          const sig = decoded.signatures[addr as Address];
          if (!sig) throw new Error('Wallet returned no signature for this account');
          return { [addr]: sig } as SignatureDictionary;
        });
      },
    };
  }, [account, authToken, authorizeIn, rememberToken]);

  const value = useMemo<WalletState>(
    () => ({ account, connecting, connect, disconnect, signer }),
    [account, connecting, connect, disconnect, signer],
  );

  return createElement(Ctx.Provider, { value }, children);
}
