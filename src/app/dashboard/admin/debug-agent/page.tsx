'use client';
import { useState } from 'react';
import { useUser } from '@/firebase';

export default function DebugAgentPage() {
  const { user } = useUser();
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [fixStatus, setFixStatus] = useState<Record<string, string>>({});

  async function runDiagnostic() {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/debug-agent?name=${encodeURIComponent(name)}&year=${year}`, {
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

  async function fixUid(profileDocId: string, email: string) {
    setFixStatus(prev => ({ ...prev, [profileDocId]: 'Fixing...' }));
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/fix-agent-uid', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileDocId, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fix failed');
      setFixStatus(prev => ({ ...prev, [profileDocId]: `✅ ${data.message} (newUid: ${data.newFirebaseUid})` }));
      // Re-run diagnostic after fix
      setTimeout(() => runDiagnostic(), 1000);
    } catch (e: any) {
      setFixStatus(prev => ({ ...prev, [profileDocId]: `❌ ${e.message}` }));
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Agent Data Diagnostic</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Checks Firebase Auth record, profile resolution strategies (all 4), transaction counts, activity counts, and goals.
        Use this to diagnose why an agent&apos;s dashboard shows no data on direct login.
      </p>

      <div className="flex gap-3 mb-6">
        <input
          className="border rounded px-3 py-2 flex-1 text-sm"
          placeholder="Agent name (e.g. noah)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runDiagnostic()}
        />
        <input
          className="border rounded px-3 py-2 w-24 text-sm"
          type="number"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
        />
        <button
          onClick={runDiagnostic}
          disabled={loading || !name.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Diagnostic'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>
      )}

      {result && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Found <strong>{result.agentCount}</strong> matching profile(s) for &quot;{name}&quot; — Year: {result.year}
          </p>

          {result.results?.map((r: any, i: number) => (
            <div key={i} className="border rounded-lg mb-6 overflow-hidden">
              {/* Header */}
              <div className={`px-4 py-3 font-semibold text-sm flex items-center gap-2 ${
                r.fixRecommendation?.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                <span className="text-lg">{r.fixRecommendation?.startsWith('✅') ? '✅' : '🚨'}</span>
                <span>{r.profile.name || r.profile.docId}</span>
                <span className="text-xs font-normal opacity-70">— {r.profile.email}</span>
              </div>

              <div className="p-4 space-y-4">
                {/* Fix Recommendation */}
                <div className={`rounded p-3 text-sm font-medium ${
                  r.fixRecommendation?.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
                }`}>
                  {r.fixRecommendation}
                </div>

                {/* Fix UID Button — show when firebaseUid is missing or wrong */}
                {r.firebaseAuth && r.firstSuccessfulStrategy === 'NONE' && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => fixUid(r.profile.docId, r.profile.email)}
                      className="bg-orange-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-orange-600"
                    >
                      🔧 Fix: Stamp firebaseUid onto Profile
                    </button>
                    {fixStatus[r.profile.docId] && (
                      <span className="text-sm">{fixStatus[r.profile.docId]}</span>
                    )}
                  </div>
                )}

                {/* Also show fix button when firebaseUid is missing even if strategy 3 works */}
                {r.firebaseAuth && !r.profile.firebaseUid && r.firstSuccessfulStrategy !== 'NONE' && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => fixUid(r.profile.docId, r.profile.email)}
                      className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600"
                    >
                      ⚡ Optimize: Add firebaseUid for faster lookups
                    </button>
                    {fixStatus[r.profile.docId] && (
                      <span className="text-sm">{fixStatus[r.profile.docId]}</span>
                    )}
                  </div>
                )}

                {/* Profile Fields */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Profile Fields</h3>
                  <table className="text-xs w-full border-collapse">
                    <tbody>
                      {[
                        ['Doc ID', r.profile.docId],
                        ['name', r.profile.name],
                        ['email', r.profile.email],
                        ['agentId', r.profile.agentId || '(not set)'],
                        ['firebaseUid', r.profile.firebaseUid || '⚠️ MISSING'],
                        ['status', r.profile.status],
                        ['role', r.profile.role],
                      ].map(([k, v]) => (
                        <tr key={k} className="border-b">
                          <td className="py-1 pr-4 font-medium text-gray-600 w-32">{k}</td>
                          <td className={`py-1 font-mono ${!v || v === '(not set)' || String(v).startsWith('⚠️') ? 'text-red-600' : 'text-gray-800'}`}>{String(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-400 mt-1">All fields: {r.profile.allFieldNames?.join(', ')}</p>
                </div>

                {/* Firebase Auth */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Firebase Auth Record</h3>
                  {r.firebaseAuthError ? (
                    <p className="text-xs text-red-600">❌ Error: {r.firebaseAuthError}</p>
                  ) : r.firebaseAuth ? (
                    <table className="text-xs w-full border-collapse">
                      <tbody>
                        {Object.entries(r.firebaseAuth).map(([k, v]) => (
                          <tr key={k} className="border-b">
                            <td className="py-1 pr-4 font-medium text-gray-600 w-32">{k}</td>
                            <td className="py-1 font-mono text-gray-800">{String(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-xs text-gray-500">No auth record checked (no email on profile)</p>
                  )}
                </div>

                {/* Resolution Strategies */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Profile Resolution Strategies</h3>
                  <div className="space-y-1">
                    {Object.entries(r.resolutionStrategies || {}).map(([k, v]) => (
                      <div key={k} className={`text-xs px-2 py-1 rounded ${String(v).startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        <span className="font-medium">{k}:</span> {String(v)}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mt-2 font-medium">
                    First successful: <span className={r.firstSuccessfulStrategy === 'NONE' ? 'text-red-600 font-bold' : 'text-green-600'}>{r.firstSuccessfulStrategy}</span>
                  </p>
                </div>

                {/* Transaction Counts */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Transactions (Year {year})</h3>
                  <div className="text-xs mb-1 font-medium">{r.dataDiagnosis}</div>
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-1 pr-4 font-medium">agentId value</th>
                        <th className="text-left py-1">Count (year {year})</th>
                        <th className="text-left py-1 pl-4">Count (all years)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.allPossibleIds?.map((id: string) => (
                        <tr key={id} className="border-b">
                          <td className="py-1 pr-4 font-mono">{id}</td>
                          <td className={`py-1 ${(r.transactionCountsByIdThisYear?.[id] || 0) > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                            {r.transactionCountsByIdThisYear?.[id] ?? '?'}
                          </td>
                          <td className={`py-1 pl-4 ${(r.transactionCountsByIdAllYears?.[id] || 0) > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                            {r.transactionCountsByIdAllYears?.[id] ?? '?'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Activity Counts */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Daily Activity (Year {year})</h3>
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-1 pr-4 font-medium">agentId value</th>
                        <th className="text-left py-1">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.allPossibleIds?.map((id: string) => (
                        <tr key={id} className="border-b">
                          <td className="py-1 pr-4 font-mono">{id}</td>
                          <td className={`py-1 ${(r.activityCountsByIdThisYear?.[id] || 0) > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                            {r.activityCountsByIdThisYear?.[id] ?? '?'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Goals */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Goals (brokerCommandGoals, Year {year})</h3>
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-1 pr-4 font-medium">segment</th>
                        <th className="text-left py-1">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(r.goalCountsBySegment || {}).map(([seg, count]) => (
                        <tr key={seg} className="border-b">
                          <td className="py-1 pr-4 font-mono">{seg}</td>
                          <td className={`py-1 ${Number(count) > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>{String(count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Business Plan */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Business Plan</h3>
                  <p className="text-xs">
                    {r.businessPlan?.exists
                      ? <span className="text-green-600">✅ Found at: {r.businessPlan.path}</span>
                      : <span className="text-gray-400">No business plan found for year {year}</span>
                    }
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Raw JSON toggle */}
          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer">View raw JSON</summary>
            <pre className="text-xs bg-gray-50 p-3 rounded mt-2 overflow-auto max-h-96">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
