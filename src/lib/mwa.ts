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
import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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

const APP_IDENTITY = {
  name: 'Gliana Agent',
  uri: 'https://agent.glianalabs.com',
  icon: 'favicon.ico',
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

interface WalletState {
  account: WalletAccount | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** kit signer for @solana/mpp — null until connected. */
  signer: TransactionPartialSigner | null;
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

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { acct, token } = await transact(async (wallet) => {
        const result = await wallet.authorize({ chain: CHAIN, identity: APP_IDENTITY });
        return { acct: pickAccount(result), token: result.auth_token };
      });
      setAccount(acct);
      setAuthToken(token);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    const token = authToken;
    setAccount(null);
    setAuthToken(null);
    if (token) {
      // Best-effort revoke; ignore failures (e.g. wallet not reachable).
      transact(async (wallet) => wallet.deauthorize({ auth_token: token })).catch(() => {});
    }
  }, [authToken]);

  // A kit partial signer that routes signing through MWA. Rebuilt when the
  // connected account / auth token changes.
  const signer = useMemo<TransactionPartialSigner | null>(() => {
    if (!account || !authToken) return null;
    const addr = address(account.address);
    return {
      address: addr,
      async signTransactions(
        transactions: readonly Transaction[],
      ): Promise<readonly SignatureDictionary[]> {
        const payloads = transactions.map((tx) => getBase64EncodedWireTransaction(tx));
        const { signed_payloads } = await transact(async (wallet) => {
          // Reuse the existing authorization for this signing session.
          await wallet.reauthorize({ auth_token: authToken, identity: APP_IDENTITY });
          return wallet.signTransactions({ payloads });
        });
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
  }, [account, authToken]);

  const value = useMemo<WalletState>(
    () => ({ account, connecting, connect, disconnect, signer }),
    [account, connecting, connect, disconnect, signer],
  );

  return createElement(Ctx.Provider, { value }, children);
}
