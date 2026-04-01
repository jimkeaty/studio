'use client';
export const dynamic = 'force-dynamic';

import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BrokerDashboardInner } from '@/components/dashboard/broker/BrokerDashboardInner';

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
    const { isAdmin, loading: adminLoading } = useIsAdminLike();

    // 1. While auth state is loading, show a skeleton UI.
    if (userLoading || adminLoading) {
        return <BrokerDashboardSkeleton />;
    }

    // 2. Once auth is ready, check if user is logged in at all.
    if (!user) {
        return (
            <div className="flex items-center justify-center h-full">
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

    // 3. Check if the user is admin-like (super admin OR office_admin OR tc_admin).
    if (isAdmin) {
        return <BrokerDashboardInner />;
    }

    // 4. Not an admin — show access denied.
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
