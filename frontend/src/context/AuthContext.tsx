import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { useMutation } from "@apollo/client";
import { LOGIN, LOGOUT, REFRESH_TOKEN } from "../graphql/mutations/auth";
import type { User } from "../types";

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, otpCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem("accessToken"));

  const [loginMutation] = useMutation(LOGIN);
  const [logoutMutation] = useMutation(LOGOUT);
  const [refreshMutation] = useMutation(REFRESH_TOKEN);

  const login = useCallback(async (email: string, password: string, otpCode?: string) => {
    const { data } = await loginMutation({ variables: { email, password, otpCode } });
    if (data?.login) {
      setAccessToken(data.login.accessToken);
      setUser(data.login.user);
      localStorage.setItem("accessToken", data.login.accessToken);
      localStorage.setItem("refreshToken", data.login.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.login.user));
    }
  }, [loginMutation]);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      try { await logoutMutation({ variables: { refreshToken } }); } catch {}
    }
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  }, [logoutMutation]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return false;

    try {
      const { data } = await refreshMutation({ variables: { refreshToken } });
      if (data?.refreshToken) {
        setAccessToken(data.refreshToken.accessToken);
        localStorage.setItem("accessToken", data.refreshToken.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken.refreshToken);
        return true;
      }
    } catch {}
    return false;
  }, [refreshMutation]);

  const value = useMemo(() => ({
    user,
    accessToken,
    isAuthenticated: !!user && !!accessToken,
    isAdmin: user?.role === "ADMIN",
    login,
    logout,
    refreshSession,
  }), [user, accessToken, login, logout, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}