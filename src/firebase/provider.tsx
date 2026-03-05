"use client";

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import { createContext, useContext, type ReactNode } from "react";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";

type FirebaseContextValue = {
  app: FirebaseApp;
  auth: Auth;
};

const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

export function FirebaseProvider({
  value,
  children,
}: {
  value: FirebaseContextValue;
  children: ReactNode;
}) {
  return (
    <FirebaseContext.Provider value={value}>
      <FirebaseErrorListener>{children}</FirebaseErrorListener>
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error("useFirebase must be used within a FirebaseProvider");
  return context;
}

export function useFirebaseApp() {
  return useFirebase().app;
}

export function useAuth() {
  return useFirebase().auth;
}
