'use client';
import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { useImpersonation } from '@/contexts/ImpersonationContext';

export default function DebugGoalsPage() {
  const { user } = useUser();
  const { isImpersonating } = useImpersonation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('matthew');
  const [year, setYear] = useState(new Date().getFullYear());

  async function run() {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/debug-goals?name=${encodeURIComponent(name)}&year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setData({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Goals Diagnostic Tool</h1>
      <div className="flex gap-3 mb-4">
        <input
          className="border rounded px-3 py-2 text-sm"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Agent name (e.g. matthew)"
        />
        <input
          className="border rounded px-3 py-2 text-sm w-24"
          type="number"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
        />
        <button
          onClick={run}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Run Diagnostic'}
        </button>
      </div>
      {data && (
        <pre className="bg-gray-100 rounded p-4 text-xs overflow-auto max-h-[70vh] whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
