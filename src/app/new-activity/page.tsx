'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewActivityConfig, NewActivityRollup } from '@/lib/types';
import { Building, FileSignature, Home } from 'lucide-react';
import React from 'react';
import { format, parseISO } from 'date-fns';

// Mock data simulating the Firestore documents
const mockConfig: NewActivityConfig = {
  lookbackDays: 60,
  showTopN: 25,
  sortOrder: 'newestFirst',
  title: 'New Activity (Last 60 Days)',
  showAddress: true,
};

const mockRollup: NewActivityRollup = {
  lookbackDays: 60,
  generatedAt: new Date().toISOString(),
  newListings: [
    { id: 'l1', date: '2024-07-22', agentDisplayName: 'Sonja D.', addressShort: '123 Main St, Lafayette', price: 450000 },
    { id: 'l2', date: '2024-07-21', agentDisplayName: 'Michael C.', addressShort: '456 Oak Ave, Broussard', price: 320000 },
    { id: 'l3', date: '2024-07-20', agentDisplayName: 'Alicia R.', addressShort: '789 Pine Ln, Youngsville', price: 680000 },
    { id: 'l4', date: '2024-07-19', agentDisplayName: 'David B.', addressShort: '101 Maple Dr, Scott', price: 275000 },
    { id: 'l5', date: '2024-07-18', agentDisplayName: 'Sonja D.', addressShort: '212 Birch Rd, Carencro', price: 510000 },
  ],
  newContracts: [
    { id: 'c1', date: '2024-07-23', agentDisplayName: 'Jessica P.', addressShort: '111 Elm St, New Iberia', price: 310000 },
    { id: 'c2', date: '2024-07-22', agentDisplayName: 'Emily W.', addressShort: '222 Cedar Ct, Abbeville', price: 240000 },
    { id: 'c3', date: '2024-07-20', agentDisplayName: 'Chris G.', addressShort: '333 Willow Way, Breaux Bridge', price: 425000 },
    { id: 'c4', date: '2024-07-19', agentDisplayName: 'Michael C.', addressShort: '444 River Bend, St. Martinville', price: 190000 },
  ],
};

const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD', 
        minimumFractionDigits: 0 
    }).format(amount);

const formatDate = (dateStr: string) => format(parseISO(dateStr), 'MMM d');


const ActivityColumn = ({ title, items, icon: Icon, showAddress }: { title: string, items: any[], icon: React.ElementType, showAddress: boolean }) => (
  <Card className="flex-1 bg-gray-800/50 border-gray-700">
    <CardHeader>
      <CardTitle className="flex items-center gap-3 text-2xl font-semibold text-gray-300">
        <Icon className="h-6 w-6 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
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
    </CardContent>
  </Card>
);

export default function NewActivityPage() {
  const config = mockConfig;
  const data = mockRollup;

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
        <ActivityColumn title="New Listings" items={data.newListings} icon={Home} showAddress={config.showAddress} />
        <ActivityColumn title="New Contracts" items={data.newContracts} icon={FileSignature} showAddress={config.showAddress} />
      </main>

      <footer className="text-center mt-12 text-gray-600">
        <p>Last updated: {format(parseISO(data.generatedAt), 'Pp')}</p>
      </footer>
    </div>
  );
}
