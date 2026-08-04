import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Cross-platform secret storage.
 * - Native: expo-secure-store (Keychain / Keystore)
 * - Web / PWA: localStorage (SecureStore is unavailable on web)
 */

const secureStoreOptions: SecureStore.SecureStoreOptions = Platform.select({
  ios: {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  },
  default: {},
}) as SecureStore.SecureStoreOptions;

function isWeb(): boolean {
  return Platform.OS === 'web';
}

function webGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function webSet(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('Browser storage is unavailable');
    }
    localStorage.setItem(key, value);
  } catch (error) {
    throw new Error('Could not persist credentials in this browser', {
      cause: error,
    });
  }
}

function webRemove(key: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('Browser storage is unavailable');
    }
    localStorage.removeItem(key);
  } catch (error) {
    throw new Error('Could not remove credentials from this browser', {
      cause: error,
    });
  }
}

export async function getSecret(key: string): Promise<string | null> {
  if (isWeb()) {
    return webGet(key);
  }

  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) {
      return webGet(key);
    }
    return await SecureStore.getItemAsync(key, secureStoreOptions);
  } catch {
    return webGet(key);
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (isWeb()) {
    webSet(key, value);
    return;
  }

  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) {
      throw new Error('Secure storage is unavailable');
    }
    await SecureStore.setItemAsync(key, value, secureStoreOptions);
  } catch (error) {
    throw new Error('Could not securely store credentials on this device', {
      cause: error,
    });
  }
}

export async function deleteSecret(key: string): Promise<void> {
  if (isWeb()) {
    webRemove(key);
    return;
  }

  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) {
      throw new Error('Secure storage is unavailable');
    }
    await SecureStore.deleteItemAsync(key, secureStoreOptions);
  } catch (error) {
    throw new Error('Could not remove credentials from this device', {
      cause: error,
    });
  }
}
