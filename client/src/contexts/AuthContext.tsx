import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiRequest, setAuthToken, removeAuthToken, getAuthToken } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  email?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  signup: (username: string, email: string, password: string, confirmPassword: string, otp: string) => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionReplacedMessage, setSessionReplacedMessage] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/v1/a/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        try {
          const errData = await response.clone().json();
          if (errData.error === "SESSION_REPLACED") {
            removeAuthToken();
            setUser(null);
            setSessionReplacedMessage(errData.message || "Your account has been logged in on another device.");
            return;
          }
        } catch {}
        removeAuthToken();
        setUser(null);
      }
    } catch (error) {
      removeAuthToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleSessionReplaced = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setUser(null);
      setSessionReplacedMessage(detail || "Your account has been logged in on another device.");
    };
    window.addEventListener("session-replaced", handleSessionReplaced);
    return () => window.removeEventListener("session-replaced", handleSessionReplaced);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiRequest("POST", "/api/v1/p/auth/login", { identifier: email, password });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Login failed");
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
  };

  const googleLogin = async (idToken: string) => {
    const response = await apiRequest("POST", "/api/v1/p/auth/google", { idToken });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Google login failed");
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
  };

  const sendOtp = async (email: string) => {
    const response = await apiRequest("POST", "/api/v1/p/mail_otp", { email });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to send verification code");
    }
  };

  const signup = async (username: string, email: string, password: string, confirmPassword: string, otp: string) => {
    const response = await apiRequest("POST", "/api/v1/p/auth/signup", { 
      username, 
      email,
      password, 
      confirmPassword,
      otp,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Signup failed");
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
  };

  const logout = async () => {
    await apiRequest("POST", "/api/v1/a/auth/logout", {});
    removeAuthToken();
    setUser(null);
  };

  const updateUser = (partial: Partial<User>) => {
    setUser((prev) => prev ? { ...prev, ...partial } : prev);
  };

  const isAdmin = user?.role === "ADMIN";

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin, login, googleLogin, signup, sendOtp, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
