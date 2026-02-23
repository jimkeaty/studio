// src/components/dashboard/broker/RecruitingAdminConsole.tsx
'use client';

// TODO: This component must be migrated to a secure Admin API route.
// The current client-side queries violate security rules and are disabled.

import { useUser } from '@/firebase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

export function RecruitingAdminConsole() {
  const { user } = useUser();
  
  if (user?.uid !== ADMIN_UID) {
    // This component is only rendered by BrokerDashboardInner which already performs this check.
    // This is an extra safeguard.
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Recruiting Incentives – Admin Console
        </CardTitle>
      </CardHeader>
      <CardContent>
        {process.env.NODE_ENV === 'development' ? (
           <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Developer Notice</AlertTitle>
              <AlertDescription>
                Recruiting Admin Console is temporarily disabled in Broker Command until it is migrated to an Admin API.
              </AlertDescription>
          </Alert>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
              <Loader2 className="mx-auto h-8 w-8 animate-spin mb-4" />
              <h3 className="text-lg font-medium">Coming Soon</h3>
              <p className="text-sm">The full recruiting monitor will be available here shortly.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
