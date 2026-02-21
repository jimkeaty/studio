
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewActivityConfig, NewActivityRollup } from '@/lib/types';
import { Building, FileSignature, Home, AlertCircle, Loader2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { useFirestore } from '@/firebase';
import { getNewActivityRows } from '@/lib/rollupsService';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

// Mock data simulating the Firestore config document
const mockConfig: NewActivityConfig = {
  lookbackDays: 60,
  showTopN: 25,
  sortOrder: 'newestFirst',
  title: 'New Activity (Last 60 Days)',
  showAddress: true,
};

const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD', 
        minimumFractionDigits: 0 
    }).format(amount);

const formatDate = (dateStr: string) => format(parseISO(dateStr), 'MMM d');


const ActivityColumn = ({ title, items, icon: Icon, showAddress, loading }: { title: string, items: any[], icon: React.ElementType, showAddress: boolean, loading: boolean }) => (
  <Card className="flex-1 bg-gray-800/50 border-gray-700">
    <CardHeader>
      <CardTitle className="flex items-center gap-3 text-2xl font-semibold text-gray-300">
        <Icon className="h-6 w-6 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      {loading ? (
        <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="grid grid-cols-3 gap-4 items-center border-b border-gray-700/50 pb-3 last:border-b-0">
                    <div className="col-span-1 space-y-2">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="col-span-2 text-right space-y-2">
                        <Skeleton className="h-6 w-32 ml-auto" />
                        {showAddress && <Skeleton className="h-4 w-40 ml-auto" />}
                    </div>
                </div>
            ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
            No new activity to report.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-3 gap-4 items-center border-b border-gray-700/50 pb-3 last:border-b-0">
              <div className="col-span-1">
                <p className="font-semibold text-white">{item.agentDisplayName}</p>
                <p className="text-sm text-gray-400">{formatDate(item.date)}</p>
              </div>
              <div className="col-span-2 text-right">
                <p className="text-xl font-bold text-orange-400">{formatCurrency(item.price)}</p>
                {showAddress && <p className="text-sm text-gray-500 truncate">{item.addressShort}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

export default function NewActivityPage() {
  const config = mockConfig;
  const db = useFirestore();

  const [data, setData] = useState<NewActivityRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    
    setLoading(true);
    const selectedYear = new Date().getFullYear();

    getNewActivityRows(db, selectedYear)
        .then(fetchedData => {
            setData(fetchedData);
            setError(null);
        })
        .catch(err => {
            console.error("Failed to fetch new activity data:", err);
            setError("Could not load new activity. Please try again later.");
        })
        .finally(() => {
            setLoading(false);
        });

  }, [db]);

  return (
    <div className="dark min-h-screen bg-gray-900 text-white p-8 font-sans">
       <header className="text-center mb-12 flex items-center justify-center gap-4">
            <Building className="h-12 w-12 text-primary hidden sm:block" />
            <div>
                <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
                {config.title}
                </h1>
                <p className="text-xl text-gray-400 mt-1">A real-time view of our brokerage's new listings and contracts.</p>
            </div>
      </header>

      <main className="max-w-screen-2xl mx-auto flex flex-col lg:flex-row gap-8">
        {error ? (
             <Alert variant="destructive" className="w-full bg-red-900/50 border-red-700 text-red-300">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        ) : (
            <>
                <ActivityColumn title="New Listings" items={data?.newListings ?? []} icon={Home} showAddress={config.showAddress} loading={loading} />
                <ActivityColumn title="New Contracts" items={data?.newContracts ?? []} icon={FileSignature} showAddress={config.showAddress} loading={loading} />
            </>
        )}
      </main>

      <footer className="text-center mt-12 text-gray-600">
        {loading ? (
             <p>Loading...</p>
        ) : data ? (
            <p>Last updated: {format(parseISO(data.generatedAt), 'Pp')}</p>
        ) : null}
      </footer>
    </div>
  );
}
