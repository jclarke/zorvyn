import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ConductorClient } from './api';
import { deleteSecret, getSecret, setSecret } from './storage';
import type { Me } from './types';
import { ConductorApiError } from './types';

/** Storage key for the Conductor API key (never from .env). */
const API_KEY_STORAGE = 'conductor_api_key';

type AuthState = {
  ready: boolean;
  apiKey: string | null;
  me: Me | null;
  client: ConductorClient | null;
  error: string | null;
  signIn: (apiKey: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(
    () => (apiKey ? new ConductorClient(apiKey) : null),
    [apiKey],
  );

  const bootstrap = useCallback(async () => {
    // Restore a key the user previously entered (SecureStore native / localStorage web).
    const stored = await getSecret(API_KEY_STORAGE);
    if (!stored) {
      setReady(true);
      return;
    }

    try {
      const c = new ConductorClient(stored);
      const identity = await c.getMe();
      setApiKey(stored);
      setMe(identity);
      setError(null);
    } catch (e) {
      if (e instanceof ConductorApiError && e.status === 401) {
        await deleteSecret(API_KEY_STORAGE);
        setApiKey(null);
        setMe(null);
        setError('Saved API key is invalid. Please sign in again.');
      } else {
        // Network / transient error — keep the stored key so the user stays signed in
        setApiKey(stored);
        setMe(null);
        setError(
          e instanceof Error
            ? e.message
            : 'Could not verify session. Check your connection.',
        );
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) {
      throw new Error('API key is required');
    }

    const c = new ConductorClient(trimmed);
    const identity = await c.getMe();
    // Persist first so a web remount during navigation still finds the key
    await setSecret(API_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setMe(identity);
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    await deleteSecret(API_KEY_STORAGE);
    setApiKey(null);
    setMe(null);
    setError(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!client) return;
    const identity = await client.getMe();
    setMe(identity);
  }, [client]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      apiKey,
      me,
      client,
      error,
      signIn,
      signOut,
      refreshMe,
    }),
    [ready, apiKey, me, client, error, signIn, signOut, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

/** Returns the client when authenticated; null otherwise (never throws). */
export function useOptionalClient(): ConductorClient | null {
  return useAuth().client;
}

/**
 * Client for authenticated screens. Safe during auth redirects: returns null
 * instead of throwing so a flash of (tabs) cannot crash the tree.
 */
export function useClient(): ConductorClient | null {
  return useAuth().client;
}
