'use client';
import { useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bug, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface StaffRow {
  email: string;
  firebaseUid: string | null;
  usersDocExists: boolean;
  notificationPrefs: Record<string, any> | null;
  recentNotifCount: number;
  unreadNotifCount: number;
  lastNotifAt: string | null;
  issues: string[];
}

export default function NotificationDebugPage() {
  const { user } = useUser();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  const runDiagnostic = async () => {
    if (!user) return;
    setLoading(true);
    setRows([]);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/notification-debug', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRows(data.rows || []);
      setUsedFallback(data.usedFallback || false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const runFix = async () => {
    if (!user) return;
    setFixing(true);
    setFixResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/fix-staff-notifications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setFixResult(`Fixed ${data.processed} staff members. Errors: ${data.errors}. Details: ${JSON.stringify(data.results?.slice(0, 5))}`);
      // Re-run diagnostic after fix
      await runDiagnostic();
    } catch (e) {
      setFixResult('Fix failed: ' + String(e));
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6 text-red-500" /> Notification Debug
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Diagnose why staff/TC are not receiving in-app bell notifications.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runFix} disabled={fixing} variant="outline" className="gap-2">
            {fixing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
            {fixing ? 'Fixing…' : 'Force-Fix All Staff'}
          </Button>
          <Button onClick={runDiagnostic} disabled={loading} className="gap-2">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
            {loading ? 'Running…' : 'Run Diagnostic'}
          </Button>
        </div>
      </div>

      {fixResult && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800 font-mono break-all">
          {fixResult}
        </div>
      )}

      {usedFallback && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          ⚠️ <strong>Composite Firestore index is missing.</strong> The bell is using a fallback query that may not return results in the correct order. Go to Firebase Console → Firestore → Indexes and create a composite index on the <code>notifications</code> collection: <code>recipientUid ASC, read ASC, createdAt DESC</code>.
        </div>
      )}

      {rows.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Click "Run Diagnostic" to check the notification pipeline for all staff members.
          </CardContent>
        </Card>
      )}

      {rows.map((row) => (
        <Card key={row.email} className={row.issues.length > 0 ? 'border-red-300' : 'border-green-300'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {row.issues.length === 0
                ? <CheckCircle className="h-4 w-4 text-green-600" />
                : <XCircle className="h-4 w-4 text-red-500" />
              }
              {row.email}
              {row.issues.length === 0
                ? <Badge className="bg-green-100 text-green-800 text-xs">OK</Badge>
                : <Badge className="bg-red-100 text-red-800 text-xs">{row.issues.length} issue{row.issues.length > 1 ? 's' : ''}</Badge>
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
              <div>
                <p className="text-xs text-muted-foreground">Firebase UID</p>
                <p className="font-mono text-xs truncate">{row.firebaseUid || <span className="text-red-500">MISSING</span>}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">users/ doc</p>
                <p>{row.usersDocExists ? '✅ Exists' : '❌ Missing'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">in_app pref</p>
                <p>{row.notificationPrefs?.in_app === true ? '✅ true' : row.notificationPrefs?.in_app === false ? '❌ false' : '⚠️ not set'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Notifications in Firestore</p>
                <p>{row.recentNotifCount} total · {row.unreadNotifCount} unread</p>
              </div>
            </div>
            {row.lastNotifAt && (
              <p className="text-xs text-muted-foreground mb-2">Last notification: {new Date(row.lastNotifAt).toLocaleString()}</p>
            )}
            {row.issues.length > 0 && (
              <div className="space-y-1">
                {row.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded px-2 py-1">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {issue}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
