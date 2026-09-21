import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { useApolloClient, useMutation } from "@apollo/client";
import { COMPLETE_LOGIN, LOGIN, LOGOUT, REFRESH_TOKEN } from "../graphql/mutations/auth";
import type { User } from "../types";

interface LoginChallenge {
  email: string;
  hasExistingId: boolean;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Step 1: password (+2FA). Does not authenticate on its own — returns a
   * challenge; call completeLogin with the account's ID No. to finish. */
  login: (email: string, password: string, otpCode?: string) => Promise<LoginChallenge>;
  /** Step 2: confirms (or, first time, sets) the account's ID No. and
   * actually establishes the session. */
  completeLogin: (email: string, idNo: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  ensureFreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem("accessToken"));
  const client = useApolloClient();

  const [loginMutation] = useMutation(LOGIN);
  const [completeLoginMutation] = useMutation(COMPLETE_LOGIN);
  const [logoutMutation] = useMutation(LOGOUT);
  const [refreshMutation] = useMutation(REFRESH_TOKEN);

  const login = useCallback(async (email: string, password: string, otpCode?: string): Promise<LoginChallenge> => {
    const { data } = await loginMutation({ variables: { email, password, otpCode } });
    if (!data?.login) {
      throw new Error("Login failed");
    }
    return data.login;
  }, [loginMutation]);

  const completeLogin = useCallback(async (email: string, idNo: string) => {
    await client.resetStore();
    const { data } = await completeLoginMutation({ variables: { email, idNo } });
    if (data?.completeLogin) {
      setAccessToken(data.completeLogin.accessToken);
      setUser(data.completeLogin.user);
      localStorage.setItem("accessToken", data.completeLogin.accessToken);
      localStorage.setItem("refreshToken", data.completeLogin.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.completeLogin.user));
    }
  }, [completeLoginMutation, client]);

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
    await client.resetStore();
  }, [logoutMutation, client]);

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

  const ensureFreshToken = useCallback(async (): Promise<boolean> => {
    return refreshSession();
  }, [refreshSession]);

  const value = useMemo(() => ({
    user,
    accessToken,
    isAuthenticated: !!user && !!accessToken,
    isAdmin: user?.role === "ADMIN",
    login,
    completeLogin,
    logout,
    refreshSession,
    ensureFreshToken,
  }), [user, accessToken, login, completeLogin, logout, refreshSession, ensureFreshToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}