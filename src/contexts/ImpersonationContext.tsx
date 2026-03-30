'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
const STORAGE_KEY = 'impersonation_session';
const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';
export interface ImpersonatedAgent {
  uid: string;
  name: string;
  avatarUrl?: string;
}
interface ImpersonationState {
  agent: ImpersonatedAgent | null;
  isImpersonating: boolean;
  impersonationReady: boolean;
  startImpersonation: (agent: ImpersonatedAgent) => void;
  stopImpersonation: () => void;
}
const ImpersonationContext = createContext<ImpersonationState>({
  agent: null,
  isImpersonating: false,
  impersonationReady: false,
  startImpersonation: () => {},
  stopImpersonation: () => {},
});
export function ImpersonationProvider({
  children,
  adminUid,
  getToken,
}: {
  children: ReactNode;
  adminUid: string | null;
  getToken?: () => Promise<string>;
}) {
  // Synchronously restore impersonation session from sessionStorage at mount time.
  // This avoids a render cycle where impersonationReady is false and data fetches
  // are blocked, causing a flash of wrong data (0/F grades) on first load.
  //
  // We read sessionStorage synchronously in the useState initializer:
  //   - If a valid session exists → restore it immediately, mark ready
  //   - If no session exists → no impersonation to restore, mark ready immediately
  //
  // The adminUid check is still needed to prevent non-admins from impersonating,
  // but we no longer need to wait for it to mark impersonationReady.
  const [agent, setAgent] = useState<ImpersonatedAgent | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ImpersonatedAgent;
        if (parsed?.uid && parsed?.name) return parsed;
      }
    } catch { /* ignore */ }
    return null;
  });

  // impersonationReady: true immediately on client (we restored synchronously above).
  // On server (SSR), starts false and is set true on mount via useEffect below.
  const [impersonationReady, setImpersonationReady] = useState<boolean>(
    typeof window !== 'undefined' // true on client, false during SSR
  );

  // On SSR hydration: mark ready after mount (client-side only)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    // Already ready on client from synchronous init above — just ensure it's set
    setImpersonationReady(true);
  }, []);
  const startImpersonation = useCallback(
    (next: ImpersonatedAgent) => {
      if (adminUid !== ADMIN_UID) return;
      setAgent(next);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      // Fire audit log (best-effort)
      if (getToken) {
        getToken()
          .then((token) =>
            fetch('/api/admin/audit-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action: 'impersonation_start', targetUid: next.uid, targetName: next.name }),
            })
          )
          .catch(() => {});
      }
    },
    [adminUid, getToken]
  );
  const stopImpersonation = useCallback(() => {
    const prev = agent;
    setAgent(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    // Fire audit log (best-effort)
    if (getToken && prev) {
      getToken()
        .then((token) =>
          fetch('/api/admin/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'impersonation_stop', targetUid: prev.uid, targetName: prev.name }),
          })
        )
        .catch(() => {});
    }
  }, [agent, getToken]);
  return (
    <ImpersonationContext.Provider
      value={{
        agent,
        isImpersonating: agent !== null,
        impersonationReady,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}
export function useImpersonation() {
  return useContext(ImpersonationContext);
}
