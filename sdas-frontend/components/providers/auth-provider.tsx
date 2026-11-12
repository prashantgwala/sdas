"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { ROLE_HOME, type AuthSession, type Language, type Role } from "@/lib/types";

interface LoginInput {
  identifier: string;
  password: string;
  remember?: boolean;
}

interface RegisterInput {
  name: string;
  email: string;
  mobile: string;
  password: string;
  language?: Language;
}

interface AuthContextValue {
  session: AuthSession | null;
  user: AuthSession["user"] | null;
  permissions: string[];
  loading: boolean;
  login: (input: LoginInput) => Promise<AuthSession>;
  register: (input: RegisterInput) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (...codes: string[]) => boolean;
  hasRole: (...roles: Role[]) => boolean;
  homePath: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const router = useRouter();

  useEffect(() => {
    mounted.current = true;
    const bootstrap = async () => {
      try {
        const data = await api.get<AuthSession>("/auth/me");
        if (mounted.current) setSession(data);
      } catch {
        if (mounted.current) setSession(null);
      } finally {
        if (mounted.current) setLoading(false);
      }
    };
    void bootstrap();

    const onExpired = () => setSession(null);
    window.addEventListener("sdas:session-expired", onExpired);
    return () => {
      mounted.current = false;
      window.removeEventListener("sdas:session-expired", onExpired);
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const data = await api.post<AuthSession>("/auth/login", input);
    setSession(data);
    return data;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await api.post<AuthSession>("/auth/register", input);
    setSession(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post<{ loggedOut: boolean }>("/auth/logout");
    } finally {
      setSession(null);
      router.replace("/login");
    }
  }, [router]);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api.get<AuthSession>("/auth/me");
      setSession(data);
    } catch {
      setSession(null);
    }
  }, []);

  const hasPermission = useCallback(
    (...codes: string[]) => {
      if (!codes.length) return true;
      const granted = new Set(session?.permissions ?? []);
      return codes.some((code) => granted.has(code));
    },
    [session],
  );

  const hasRole = useCallback(
    (...roles: Role[]) => Boolean(session && roles.includes(session.user.role)),
    [session],
  );

  const homePath = session ? ROLE_HOME[session.user.role] ?? session.dashboard : "/login";

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      permissions: session?.permissions ?? [],
      loading,
      login,
      register,
      logout,
      refreshProfile,
      hasPermission,
      hasRole,
      homePath,
    }),
    [session, loading, login, register, logout, refreshProfile, hasPermission, hasRole, homePath],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
