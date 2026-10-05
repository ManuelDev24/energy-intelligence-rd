"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@energyrd/api-client";
import { AccountSchema, accountRequest, authEnabled as configuredAuth, deleteAccountRequest, invalidateAccountRequests, type Account } from "./auth/client";
const STORAGE_KEY = "energyrd.homeId";
const CHANGE_KEY = "energyrd.account-change";
interface SessionValue {
  homeId: string | null;
  ready: boolean;
  authEnabled: boolean;
  user: Account | null;
  error: string | null;
  signIn: (homeId: string) => void;
  signOut: () => Promise<void>;
  authenticate: (mode: "login" | "register", email: string, password: string, acceptTerms?: boolean) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}
const SessionContext = createContext<SessionValue | null>(null);
export function SessionProvider({ children, authEnabled = configuredAuth }: { children: ReactNode; authEnabled?: boolean }) {
  const qc = useQueryClient();
  const [homeId, setHomeId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const busy = useRef(false);
  const selection = useRef({ userId: user?.id, homeId });
  selection.current = { userId: user?.id, homeId };
  const reset = useCallback(() => {
    sequence.current += 1;
    invalidateAccountRequests();
    void qc.cancelQueries();
    qc.clear();
    setHomeId(null); setUser(null);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Optional storage */ }
  }, [qc]);
  const announce = useCallback(() => {
    try { window.localStorage.setItem(CHANGE_KEY, crypto.randomUUID()); } catch { /* Focus check remains available */ }
  }, []);
  const check = useCallback(async (keepHome = false) => {
    const previous = selection.current;
    reset(); setReady(false); setError(null);
    const current = sequence.current;
    try {
      const account = AccountSchema.parse(await accountRequest("me"));
      if (current === sequence.current) {
        setUser(account);
        if (keepHome && previous.userId === account.id) setHomeId(previous.homeId);
      }
    } catch (cause) {
      if (current === sequence.current) setError(cause instanceof Error ? cause.message : "No se pudo verificar la sesión.");
    } finally { if (current === sequence.current) setReady(true); }
  }, [reset]);
  useEffect(() => {
    if (!authEnabled) {
      try { setHomeId(window.localStorage.getItem(STORAGE_KEY)); } catch { /* Memory-only pilot */ }
      setReady(true); return;
    }
    void check();
    const storage = (event: StorageEvent) => { if (event.key === CHANGE_KEY) void check(); };
    const expired = () => { reset(); setError("La sesión venció. Inicia sesión de nuevo."); setReady(true); announce(); };
    const focus = () => { if (!busy.current) void check(true); };
    window.addEventListener("storage", storage);
    window.addEventListener("energyrd.session-expired", expired);
    window.addEventListener("focus", focus);
    return () => {
      sequence.current += 1;
      window.removeEventListener("storage", storage);
      window.removeEventListener("energyrd.session-expired", expired);
      window.removeEventListener("focus", focus);
    };
  }, [authEnabled, check, reset, announce]);
  const signIn = useCallback((id: string) => {
    if (authEnabled && !user) return;
    setHomeId(id);
    if (!authEnabled) try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* Memory-only pilot */ }
  }, [authEnabled, user]);
  const signOut = useCallback(async () => {
    busy.current = true; reset(); announce(); setReady(false); setError(null);
    try { if (authEnabled) await accountRequest("logout"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo confirmar el cierre de sesión."); }
    finally { busy.current = false; setReady(true); announce(); }
  }, [authEnabled, reset, announce]);
  const authenticate = useCallback(async (mode: "login" | "register", email: string, password: string, acceptTerms?: boolean) => {
    if (!authEnabled) throw new Error("El piloto no admite cuentas.");
    busy.current = true; reset(); announce(); setReady(false); setError(null);
    const current = sequence.current;
    // Another tab (logout/login/expiry) or this tab may have moved on while we awaited: never
    // publish a user from a superseded attempt. The BFF binds this login to the epoch it was sent
    // under, so if a logout won the race the sweep below makes the BFF revoke the stale session.
    const stale = async () => {
      try { await accountRequest("me"); } catch { /* Expected 401 once the BFF revokes it. */ }
      throw new ApiError(409, "La sesión cambió en otra pestaña. Inicia sesión de nuevo.", {}, "account_changed");
    };
    try {
      await accountRequest(mode, { email, password, acceptTerms });
      if (current !== sequence.current) return await stale();
      const account = AccountSchema.parse(await accountRequest("me"));
      if (current !== sequence.current) return await stale();
      setUser(account); announce();
    } catch (cause) {
      if (current === sequence.current) setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión.");
      throw cause;
    } finally { busy.current = false; if (current === sequence.current) setReady(true); }
  }, [authEnabled, reset, announce]);
  const deleteAccount = useCallback(async (password: string) => {
    if (!authEnabled) throw new Error("El piloto no admite cuentas.");
    // No session state is touched before upstream confirms: a wrong password or a blocked
    // deletion (sole-owner of a shared home) must leave the current account fully intact.
    await deleteAccountRequest(password);
    busy.current = true;
    reset(); announce(); setError(null); setReady(true);
    busy.current = false;
  }, [authEnabled, reset, announce]);
  const value = useMemo(() => ({ homeId, ready, authEnabled, user, error, signIn, signOut, authenticate, deleteAccount }), [homeId, ready, authEnabled, user, error, signIn, signOut, authenticate, deleteAccount]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return value;
}
