"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// El backend aún no tiene autenticación: la "sesión" demo solo recuerda la
// vivienda elegida en este navegador. No guarda credenciales ni datos personales.

const STORAGE_KEY = "energyrd.homeId";

interface SessionValue {
  homeId: string | null;
  ready: boolean;
  signIn: (homeId: string) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [homeId, setHomeId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHomeId(readStored());
    setReady(true);
  }, []);

  const signIn = useCallback((id: string) => {
    setHomeId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* sin almacenamiento: la sesión dura lo que dure la pestaña */
    }
  }, []);

  const signOut = useCallback(() => {
    setHomeId(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nada que limpiar */
    }
  }, []);

  const value = useMemo(() => ({ homeId, ready, signIn, signOut }), [homeId, ready, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
