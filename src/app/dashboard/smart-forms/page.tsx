'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SmartFormsLauncherPage() {
  return <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6"><div><h1 className="text-2xl font-bold">Smart Forms</h1><p className="text-sm text-muted-foreground">Secure reusable forms and e-signature packages, provided by the existing Smart Forms application.</p></div><Card><CardHeader><CardTitle>Launch Smart Forms</CardTitle><CardDescription>Smart Forms keeps its own forms, signature workflow, completed PDFs, and account session. If you are working from a saved transaction, use its Documents section to log the contextual launch and link the completed form back to that transaction.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3"><a href="https://smartforms-kxlzueqw.manus.space" target="_blank" rel="noreferrer"><Button>Open Smart Forms</Button></a><Link href="/dashboard/transactions/new"><Button variant="outline">Open a Transaction</Button></Link></CardContent></Card><Card><CardHeader><CardTitle>Current connection status</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Smart Forms currently has its own sign-in. No verified cross-app SSO, context-prefill endpoint, or completed-form webhook has been provided.</p><p>For safety, Smart Broker does not pass client or property data by URL. Transaction-linked launch and completion references stay in the existing transaction record until a documented integration contract is available.</p></CardContent></Card></div>;
}
