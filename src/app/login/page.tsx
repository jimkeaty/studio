"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Building, Loader2 } from "lucide-react";

import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCheckingRedirect, setIsCheckingRedirect] = useState(true);

  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          // User signed in successfully.
          console.log("Google redirect login success:", result.user.email);
          router.replace("/dashboard");
        } else {
          // No user found in redirect result, so it's a fresh visit.
          setIsCheckingRedirect(false);
        }
      } catch (err: any) {
        // Handle errors from getRedirectResult
        console.error("Redirect result error:", err);
         if (err.code === 'auth/unauthorized-domain') {
            const currentHost = window.location.hostname;
            setErrorMsg(`This app's domain (${currentHost}) is not authorized. Go to Firebase Console > Authentication > Settings > Authorized domains and add it.`);
          } else {
            setErrorMsg(String(err?.message || "An unexpected error occurred."));
          }
        setIsCheckingRedirect(false);
      }
    };
    checkRedirect();
  }, [router]);


  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setBusy(true);
    const provider = new GoogleAuthProvider();

    // No try-catch needed around this, as errors are handled by getRedirectResult
    await signInWithRedirect(auth, provider);
  };
  
  if (isCheckingRedirect) {
      return (
         <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Checking authentication status...</p>
            </div>
        </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Building className="h-12 w-12 text-primary" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              Welcome to Smart Broker USA
            </CardTitle>
            <CardDescription>
              Sign in with Google to access your dashboard.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMsg ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Authentication Error</AlertTitle>
                  <AlertDescription>
                    {errorMsg}
                  </AlertDescription>
                </Alert>
            ) : null}
            <Button className="w-full" onClick={handleGoogleSignIn} disabled={busy}>
              {busy ? "Redirecting..." : "Sign in with Google"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
