'use client';
import { useState } from 'react';
import { useUser } from '@/firebase';

export default function DebugNotificationsPage() {
  const { user } = useUser();
  const [email, setEmail] = useState('anna@keatyrealestate.com');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [fixStatus, setFixStatus] = useState('');

  async function runDiagnostic() {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/debug-notifications?email=${encodeURIComponent(email.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fixFirebaseUid() {
    if (!result?.staffDoc?.email) return;
    setFixStatus('Fixing...');
    try {
      const token = await user?.getIdToken();
      // Look up the Firebase Auth UID by email and write it to staffUsers
      const res = await fetch('/api/admin/fix-staff-uid', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: result.staffDoc.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fix failed');
      setFixStatus(`✅ Fixed! firebaseUid set to: ${data.firebaseUid}`);
      setTimeout(() => runDiagnostic(), 1500);
    } catch (e: any) {
      setFixStatus(`❌ ${e.message}`);
    }
  }

  const missingUid = result && (!result.firebaseUid || result.firebaseUid.includes('MISSING'));
  const missingUserDoc = result && result.userDoc && typeof result.userDoc === 'string' && result.userDoc.includes('NOT FOUND');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Notification Diagnostic</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Diagnose why a staff member is not receiving notifications. Checks their staffUsers record,
        Firebase UID linkage, users doc, and recent notification history.
      </p>

      <div className="flex gap-3 mb-6">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="staff email address"
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={runDiagnostic}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Run Diagnostic'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm mb-4">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Status summary */}
          <div className={`rounded-lg p-4 border ${missingUid ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
            <h2 className="font-semibold text-sm mb-1">
              {missingUid ? '❌ Root Cause Found' : '✅ UID Linkage OK'}
            </h2>
            <p className="text-sm text-gray-700">
              {missingUid
                ? `Anna's staffUsers record has no firebaseUid — she is never included in the notification recipient list. Click "Fix Now" below to resolve this automatically.`
                : `firebaseUid is set: ${result.firebaseUid}`}
            </p>
            {missingUid && (
              <button
                onClick={fixFirebaseUid}
                className="mt-3 bg-red-600 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Fix Now — Link Firebase UID
              </button>
            )}
            {fixStatus && <p className="mt-2 text-sm font-medium">{fixStatus}</p>}
          </div>

          {/* staffUsers record */}
          <div className="border rounded-lg p-4">
            <h2 className="font-semibold text-sm mb-2">staffUsers Record</h2>
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
              {JSON.stringify(result.staffDoc, null, 2)}
            </pre>
          </div>

          {/* users doc */}
          <div className="border rounded-lg p-4">
            <h2 className="font-semibold text-sm mb-2">users/{'{uid}'} Document</h2>
            {missingUserDoc ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-yellow-800 text-sm">
                ⚠️ No users doc found for this UID. Email will be resolved from staffUsers fallback.
              </div>
            ) : (
              <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
                {JSON.stringify(result.userDoc, null, 2)}
              </pre>
            )}
          </div>

          {/* Recent notifications */}
          <div className="border rounded-lg p-4">
            <h2 className="font-semibold text-sm mb-2">
              Recent In-App Notifications ({result.recentNotifications?.length ?? 0} found)
            </h2>
            {result.recentNotifications?.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-yellow-800 text-sm">
                ⚠️ No in-app notifications found for this user. This confirms notifications are not reaching them at all.
              </div>
            ) : (
              <div className="space-y-2">
                {result.recentNotifications?.map((n: any, i: number) => (
                  <div key={i} className="text-xs bg-gray-50 p-2 rounded border">
                    <span className="font-medium">{n.type}</span> — {n.title}
                    <span className="text-gray-400 ml-2">{n.read ? '(read)' : '(unread)'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All staff UIDs */}
          <div className="border rounded-lg p-4">
            <h2 className="font-semibold text-sm mb-2">All staffUsers Records (what getAllStaffUids sees)</h2>
            <div className="space-y-1">
              {result.allStaffUsers?.map((s: any, i: number) => (
                <div key={i} className={`text-xs p-2 rounded flex justify-between ${s.firebaseUid ? 'bg-green-50' : 'bg-red-50 border border-red-200'}`}>
                  <span>{s.displayName || s.email} ({s.role})</span>
                  <span className={s.firebaseUid ? 'text-green-700' : 'text-red-700 font-bold'}>
                    {s.firebaseUid ? `✓ ${s.firebaseUid.slice(0, 12)}...` : '❌ NO UID'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
