"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Building } from "lucide-react";

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

  const handleGoogleSignIn = async () => {
    try {
      setErrorMsg(null);
      setBusy(true);

      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      console.error("Sign-in click error:", err);
      setErrorMsg(String(err?.message || err));
      setBusy(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const result = await getRedirectResult(auth);

        // If user just came back from Google sign-in
        if (result?.user) {
          console.log("Google login success:", result.user.email);

          // TEMP: skip provisioning for now
          // Next step (after auth works) is to call the provisionUser Cloud Function URL directly.

          router.replace("/dashboard");
        }
      } catch (err: any) {
        if (mounted) {
          const msg = String(err?.message || "");

          // Ignore common "no redirect" / "no auth event" cases
          if (
            msg &&
            !msg.toLowerCase().includes("no redirect") &&
            !msg.toLowerCase().includes("auth/no-auth-event")
          ) {
            console.error("Redirect error:", err);
            setErrorMsg(msg);
          }
        }
      } finally {
        if (mounted) setBusy(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

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

          <CardContent className="space-y-3">
            <Button className="w-full" onClick={handleGoogleSignIn} disabled={busy}>
              {busy ? "Signing in..." : "Sign in with Google"}
            </Button>

            {errorMsg ? (
              <p className="text-sm text-red-600 break-words">{errorMsg}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
