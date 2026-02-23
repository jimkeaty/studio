'use client';

import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BrokerDashboardInner } from '@/components/dashboard/broker/BrokerDashboardInner';

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

export default function BrokerDashboardPage() {
    const { user, loading: userLoading } = useUser();

    // DEV-ONLY: Temporary debug readout to diagnose gating issues.
    // This will not be present in production builds.
    if (process.env.NODE_ENV === 'development') {
        console.log('[Broker Page Auth State]', {
            authReady: !userLoading,
            userUid: user?.uid ?? 'null',
            expectedAdminUid: ADMIN_UID,
            isAdmin: !userLoading && user?.uid === ADMIN_UID,
        });
    }

    // 1. While auth state is loading, show a skeleton UI.
    if (userLoading) {
        return <BrokerDashboardSkeleton />;
    }

    // 2. Once auth is ready, check if the user is the designated admin.
    if (user?.uid === ADMIN_UID) {
        // Only render the data-heavy component if the user is an authorized admin.
        return <BrokerDashboardInner />;
    }

    // 3. If auth is loaded and the user is not the admin, show an access denied message.
    return (
        <div className="flex items-center justify-center h-full">
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
