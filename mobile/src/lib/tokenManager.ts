/**
 * Token Manager (Hardened)
 * 
 * Centralized, thread-safe token management using encrypted storage.
 * Uses expo-secure-store (Android Keystore / iOS Keychain) instead of
 * plain-text AsyncStorage for secure credential persistence.
 * 
 * Security features:
 * - Hardware-backed encrypted storage via expo-secure-store
 * - No raw token exposure in logs
 * - Thread-safe read/write with pending-write queue
 * - Automatic migration from legacy AsyncStorage on first run
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureLog } from '../utils/secureLogger';

const TOKEN_KEY = 'authToken';
const MIGRATION_FLAG_KEY = 'token_migrated_to_secure_store';

class TokenManager {
  private token: string | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private pendingWrites: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        await this.migrateFromAsyncStorage();

        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        this.token = storedToken;
        this.isInitialized = true;

        secureLog.info('[TokenManager] Initialized', storedToken ? '(token found)' : '(no token)');
      } catch (error) {
        secureLog.error('[TokenManager] Initialization error:', error);
        this.isInitialized = true;
      }
    })();

    return this.initPromise;
  }

  /**
   * One-time migration: move token from AsyncStorage (plain text) to SecureStore (encrypted).
   * After migration, the AsyncStorage entry is deleted.
   */
  private async migrateFromAsyncStorage(): Promise<void> {
    try {
      const alreadyMigrated = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
      if (alreadyMigrated === 'true') return;

      const existingSecureToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (existingSecureToken) {
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        secureLog.info('[TokenManager] SecureStore already has token, skipping migration');
        return;
      }

      const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
      if (legacyToken) {
        await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
        await AsyncStorage.removeItem(TOKEN_KEY);
        secureLog.info('[TokenManager] Migrated token from AsyncStorage to SecureStore');
      }

      await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    } catch (error) {
      secureLog.warn('[TokenManager] Migration check failed (non-fatal)');
    }
  }

  async getToken(): Promise<string | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (this.pendingWrites) {
      await this.pendingWrites;
    }
    return this.token;
  }

  async setToken(token: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (this.pendingWrites) {
      await this.pendingWrites;
    }

    this.token = token;

    this.pendingWrites = (async () => {
      try {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        secureLog.info('[TokenManager] Token persisted to secure storage');
      } catch (error) {
        secureLog.error('[TokenManager] Failed to persist token');
        throw new Error('Failed to persist authentication token');
      } finally {
        this.pendingWrites = null;
      }
    })();

    return this.pendingWrites;
  }

  async clearToken(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (this.pendingWrites) {
      await this.pendingWrites;
    }

    this.token = null;

    this.pendingWrites = (async () => {
      try {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        secureLog.info('[TokenManager] Token cleared from secure storage');
      } catch (error) {
        secureLog.error('[TokenManager] Failed to clear token');
      } finally {
        this.pendingWrites = null;
      }
    })();

    return this.pendingWrites;
  }

  async hasToken(): Promise<boolean> {
    const token = await this.getToken();
    return token !== null && token.length > 0;
  }

  async saveToken(token: string): Promise<void> {
    return this.setToken(token);
  }
}

export const tokenManager = new TokenManager();

export async function getAuthToken(): Promise<string | null> {
  return tokenManager.getToken();
}

export async function setAuthToken(token: string): Promise<void> {
  return tokenManager.setToken(token);
}

export async function clearAuthToken(): Promise<void> {
  return tokenManager.clearToken();
}
