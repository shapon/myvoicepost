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
  signup: (username: string, email: string, password: string, confirmPassword: string, otp: string) => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/v1/m/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
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
    await apiRequest("POST", "/api/v1/m/auth/logout", {});
    removeAuthToken();
    setUser(null);
  };

  const isAdmin = user?.role === "ADMIN";

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin, login, signup, sendOtp, logout }}>
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
