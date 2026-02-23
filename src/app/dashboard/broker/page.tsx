'use client';

import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BrokerDashboardInner } from '@/components/dashboard/broker/BrokerDashboardInner';
import type { User } from 'firebase/auth';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

const BrokerDashboardSkeleton = () => (
    <div className="space-y-8">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
    </div>
);

const DebugPanel = ({ userLoading, user }: { userLoading: boolean, user: User | null }) => {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-lg z-50 border-2 border-yellow-400 font-mono text-xs">
      <h4 className="font-bold text-base text-yellow-300 mb-2">Auth Debug Panel</h4>
      <pre>
        {JSON.stringify(
          {
            'auth.loading': userLoading,
            'user.uid': user?.uid ?? 'null',
            'ADMIN_UID': ADMIN_UID,
            'gate.passes': !userLoading && user?.uid === ADMIN_UID,
          },
          null,
          2
        )}
      </pre>
    </div>
  );
};


export default function BrokerDashboardPage() {
    const { user, loading: userLoading } = useUser();

    // 1. While auth state is loading, show a skeleton UI.
    if (userLoading) {
        return (
            <>
                <DebugPanel userLoading={userLoading} user={user} />
                <BrokerDashboardSkeleton />
            </>
        );
    }

    // 2. Once auth is ready, check if user is logged in at all.
    if (!user) {
        return (
             <div className="flex items-center justify-center h-full">
                <DebugPanel userLoading={userLoading} user={user} />
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle>Authentication Required</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Please sign in to access the dashboard.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    // 3. Now that we have a user, check if they are the admin.
    if (user.uid === ADMIN_UID) {
        // Only render the data-heavy component if the user is an authorized admin.
        return (
            <>
                <DebugPanel userLoading={userLoading} user={user} />
                <BrokerDashboardInner />
            </>
        );
    }

    // 4. If auth is loaded and the user is not the admin, show an access denied message.
    return (
        <div className="flex items-center justify-center h-full">
            <DebugPanel userLoading={userLoading} user={user} />
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle>Access Denied</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Broker Command is available to staff only.</p>
                </CardContent>
            </Card>
        </div>
    );
}
