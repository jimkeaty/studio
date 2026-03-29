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
  startImpersonation: (agent: ImpersonatedAgent) => void;
  stopImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationState>({
  agent: null,
  isImpersonating: false,
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
  const [agent, setAgent] = useState<ImpersonatedAgent | null>(null);
  // Track whether we've already attempted to restore from sessionStorage.
  // We must wait until adminUid is confirmed (not null) before checking,
  // because Firebase auth loads asynchronously and adminUid starts as null.
  const restoredRef = useRef(false);

  // Restore impersonation session from sessionStorage after Firebase auth confirms the user.
  useEffect(() => {
    // Only attempt restore once, and only after we know the real adminUid.
    if (restoredRef.current) return;
    if (adminUid === null) return; // Firebase auth still loading — wait for next render
    restoredRef.current = true;
    if (adminUid !== ADMIN_UID) return; // Not admin — no impersonation to restore
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ImpersonatedAgent;
        if (parsed?.uid && parsed?.name) setAgent(parsed);
      }
    } catch {
      // ignore
    }
  }, [adminUid]);

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
