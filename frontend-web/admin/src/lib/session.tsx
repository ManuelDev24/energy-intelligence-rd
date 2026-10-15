"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch, bffFetch } from "@/lib/api";
import type { MyAccess } from "@/lib/access";

type SessionState = {
  access: MyAccess | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};
const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const loadMe = useCallback(async () => {
    const current = generation.current;
    try {
      const me = await apiFetch<MyAccess>("/api/v1/admin/me");
      if (current !== generation.current) return;
      setAccess(me);
      setError(null);
    } catch {
      if (current === generation.current) setAccess(null);
    }
  }, []);

  useEffect(() => {
    const current = generation.current;
    void (async () => {
      try {
        await bffFetch("/session");
        if (current !== generation.current) return;
        await bffFetch("/auth/refresh", { method: "POST", body: "{}" });
        if (current === generation.current) await loadMe();
      } catch { /* No active refresh cookie; login remains available. */ }
      finally { if (current === generation.current) setLoading(false); }
    })();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    const current = generation.current;
    setError(null);
    try {
      await bffFetch("/session");
      if (current !== generation.current) throw new Error("Sesión cancelada.");
      await bffFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (current !== generation.current) throw new Error("Sesión cancelada.");
      await loadMe();
      if (current !== generation.current) throw new Error("Sesión cancelada.");
    } catch (err) {
      if (current === generation.current) {
        setAccess(null);
        setError("No se pudo iniciar sesión.");
      }
      throw err;
    }
  }, [loadMe]);

  const logout = useCallback(() => {
    generation.current += 1;
    setAccess(null);
    setError(null);
    setLoading(false);
    void bffFetch("/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
  }, []);

  const value = useMemo(() => ({ access, loading, error, login, logout, refresh: loadMe }),
    [access, loading, error, login, logout, loadMe]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
