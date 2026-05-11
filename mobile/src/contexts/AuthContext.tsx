import { secureLog } from '../utils/secureLogger';
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';
import { tokenManager } from '../lib/tokenManager';
import { handleApiError, ErrorReporter } from '../utils/errorHandler';
import { registerPushTokenWithServer, unregisterPushTokenFromServer } from '../utils/pushNotifications';

const GOOGLE_SSO_START_URL = 'https://www.myvoicepost.com/api/v1/p/auth/google/start';
const USER_CACHE_KEY = 'mvp_cached_user';

type UserRole = 'GUEST' | 'USER' | 'ADMIN';

interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGoogleLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, confirmPassword: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
}

// ── User cache helpers ──────────────────────────────────────────────────────

async function saveUserCache(user: User): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // Non-critical — ignore storage errors
  }
}

async function loadUserCache(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

async function clearUserCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // Non-critical — ignore storage errors
  }
}

// ───────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const googleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGoogleDeepLink = useCallback(async (url: string) => {
    if (!url || !url.includes('auth/google')) return;

    secureLog.debug('[Google SSO] Deep link received:', url);
    if (googleTimeoutRef.current) clearTimeout(googleTimeoutRef.current);
    setIsGoogleLoading(true);

    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;

      const error = params.get('error');
      if (error) {
        secureLog.error('[Google SSO] Error from callback:', error);
        let message = 'Google sign-in failed. Please try again.';
        if (error === 'email_not_verified') {
          message = 'Your Google account email is not verified.';
        } else if (error === 'token_exchange_failed') {
          message = 'Authentication failed. Please try again.';
        }
        Alert.alert('Sign-In Failed', message);
        return;
      }

      const token = params.get('token');
      const userId = params.get('userId');
      const username = params.get('username');
      const email = params.get('email');

      if (!token || !userId || !username) {
        secureLog.error('[Google SSO] Missing data in callback URL');
        Alert.alert('Sign-In Failed', 'Something went wrong. Please try again.');
        return;
      }

      await tokenManager.saveToken(token);

      const role = (params.get('role') as UserRole) || 'GUEST';
      const userData: User = {
        id: userId,
        username: decodeURIComponent(username),
        email: email ? decodeURIComponent(email) : '',
        role,
      };

      await saveUserCache(userData);
      setUser(userData);
      registerPushTokenWithServer().catch(() => {});
      secureLog.debug('[Google SSO] Login successful:', userData.username);
    } catch (err) {
      secureLog.error('[Google SSO] Deep link handling error:', err);
      Alert.alert('Sign-In Failed', 'Something went wrong. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      if (event.url && event.url.includes('myvoicepost://auth/google')) {
        handleGoogleDeepLink(event.url);
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    Linking.getInitialURL().then((url) => {
      if (url && url.includes('myvoicepost://auth/google')) {
        handleGoogleDeepLink(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleGoogleDeepLink]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    secureLog.debug('[AutoLogin] Starting auth check...');

    // Step 1: Load cached user immediately — app shows home screen with
    // username instantly, before any network call completes.
    const cachedUser = await loadUserCache();
    if (cachedUser) {
      secureLog.debug('[AutoLogin] Cached user found — showing immediately:', cachedUser.username);
      setUser(cachedUser);
      setIsLoading(false);
    }

    // Step 2: Safety timeout — if no cache and server is very slow, unblock UI.
    const timeoutId = cachedUser
      ? null
      : setTimeout(() => {
          secureLog.warn('[AutoLogin] Auth check timeout — setting loading to false');
          setIsLoading(false);
        }, 8000);

    try {
      const token = await tokenManager.getToken();
      if (!token) {
        secureLog.debug('[AutoLogin] No token found — user not logged in');
        await clearUserCache();
        setUser(null);
        if (timeoutId) clearTimeout(timeoutId);
        setIsLoading(false);
        return;
      }

      secureLog.debug('[AutoLogin] Token found — validating with server...');

      // Step 3: Validate token with server (background if cache was shown).
      const response = await api.getUser();
      if (response.user) {
        const freshUser: User = {
          ...response.user,
          role: response.user.role || 'GUEST',
        };
        secureLog.debug('[AutoLogin] Token valid — user logged in:', freshUser.username);
        await saveUserCache(freshUser);
        setUser(freshUser);
        registerPushTokenWithServer().catch(() => {});
      } else {
        secureLog.debug('[AutoLogin] No user in response — treating as logged out');
        await tokenManager.clearToken();
        await clearUserCache();
        setUser(null);
      }
    } catch (error: any) {
      const apiError = handleApiError(error);

      if (apiError.statusCode === 401) {
        // Token is definitely invalid — force logout even if we showed cached user.
        secureLog.debug('[AutoLogin] Token invalid/expired — clearing and logging out');
        await tokenManager.clearToken();
        await clearUserCache();
        setUser(null);
      } else {
        // Network/server error — if we already showed a cached user, keep them
        // logged in (assume offline). Otherwise treat as logged out.
        if (cachedUser) {
          secureLog.debug('[AutoLogin] Network error but cached user present — staying logged in offline');
        } else {
          secureLog.debug('[AutoLogin] Auth check failed, no cache — staying logged out');
          setUser(null);
        }
        ErrorReporter.warn('Auth check failed', 'AuthContext.checkAuth', {
          error: apiError.message,
        });
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsLoading(false);
      secureLog.debug('[AutoLogin] Auth check complete');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await api.login(email, password);

      const userData: User = {
        ...response.user,
        role: response.user.role || 'GUEST',
      };
      await saveUserCache(userData);
      setUser(userData);
      registerPushTokenWithServer().catch(() => {});
    } catch (error) {
      const apiError = handleApiError(error);
      ErrorReporter.report(error, 'AuthContext.login');
      throw apiError;
    }
  };

  const register = async (username: string, email: string, password: string, confirmPassword: string, otp: string) => {
    try {
      const response = await api.register(username, email, password, confirmPassword, otp);

      const userData: User = {
        ...response.user,
        role: response.user.role || 'GUEST',
      };
      await saveUserCache(userData);
      setUser(userData);
      registerPushTokenWithServer().catch(() => {});
    } catch (error) {
      const apiError = handleApiError(error);
      ErrorReporter.report(error, 'AuthContext.register');
      throw apiError;
    }
  };

  const loginWithGoogle = async () => {
    try {
      setIsGoogleLoading(true);
      secureLog.debug('[Google SSO] Opening Google sign-in...');

      if (googleTimeoutRef.current) clearTimeout(googleTimeoutRef.current);
      googleTimeoutRef.current = setTimeout(() => {
        setIsGoogleLoading(false);
        secureLog.debug('[Google SSO] Timeout — resetting loading state');
      }, 120000);

      await Linking.openURL(GOOGLE_SSO_START_URL);
    } catch (error) {
      secureLog.error('[Google SSO] Failed to open URL:', error);
      Alert.alert('Error', 'Could not open Google sign-in. Please try again.');
      setIsGoogleLoading(false);
      if (googleTimeoutRef.current) clearTimeout(googleTimeoutRef.current);
    }
  };

  const logout = async () => {
    try {
      await unregisterPushTokenFromServer();
    } catch (error) {
      secureLog.warn('[Auth] Failed to unregister push token on logout');
    }
    try {
      await api.logout();
    } catch (error) {
      ErrorReporter.warn('Logout API call failed', 'AuthContext.logout', {
        error: handleApiError(error).message,
      });
    }
    await tokenManager.clearToken();
    await clearUserCache();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isGoogleLoading,
        login,
        register,
        logout,
        loginWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
