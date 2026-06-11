'use client';
import { useState, useRef } from 'react';
import { useUser } from '@/firebase';

interface ContactRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface ResultRow {
  contact: string;
  email: string;
  phone: string;
  status: string;
  profileId?: string;
  oldEmail?: string;
  oldPhone?: string;
  firebaseUid?: string;
}

function parseCSV(text: string): ContactRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  // Find column indices
  const firstNameIdx = headers.findIndex(h => h.toLowerCase().includes('first'));
  const lastNameIdx = headers.findIndex(h => h.toLowerCase().includes('last'));
  const emailIdx = headers.findIndex(h => h.toLowerCase().includes('e-mail') || h.toLowerCase().includes('email'));
  const phoneIdx = headers.findIndex(h => h.toLowerCase().includes('phone'));

  const rows: ContactRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const firstName = firstNameIdx >= 0 ? cols[firstNameIdx] || '' : '';
    const lastName = lastNameIdx >= 0 ? cols[lastNameIdx] || '' : '';
    const rawEmail = emailIdx >= 0 ? cols[emailIdx] || '' : '';
    const phone = phoneIdx >= 0 ? cols[phoneIdx] || '' : '';
    // Extract email from potentially messy field
    const emailMatch = rawEmail.match(/[\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0].toLowerCase() : '';
    if (firstName && email) {
      rows.push({ firstName, lastName, email, phone });
    }
  }
  return rows;
}

export default function UpdateContactsPage() {
  const { user } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setContacts(parsed);
      setResult(null);
      setError('');
    };
    reader.readAsText(file);
  }

  async function runUpdate(dryRun: boolean) {
    if (!contacts.length) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/update-agent-contacts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts, dryRun }),
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

  const noMatchResults: ResultRow[] = result?.results?.filter((r: ResultRow) => r.status === 'no_profile_match') || [];
  const updatedResults: ResultRow[] = result?.results?.filter((r: ResultRow) => r.status === 'updated' || r.status === 'dry_run') || [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Update Agent Contacts</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Upload a CSV with agent names, emails, and phone numbers. This will match each row to an agent profile
        by name and update their email and phone fields. Also stamps firebaseUid if a Firebase Auth account exists.
      </p>

      {/* File Upload */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-6 text-center">
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          Choose CSV File
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Expected columns: First Name, Last Name, E-mail 1 - Value, Phone 1 - Value
        </p>
      </div>

      {/* Preview */}
      {contacts.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">
              {contacts.length} contacts parsed from CSV
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => runUpdate(true)}
                disabled={loading}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {loading ? 'Running...' : 'Dry Run (Preview)'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Update email and phone for ${contacts.length} agents in Firestore? This cannot be undone.`)) {
                    runUpdate(false);
                  }
                }}
                disabled={loading}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update All Agents'}
              </button>
            </div>
          </div>

          <div className="border rounded overflow-hidden">
            <table className="text-xs w-full border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Name</th>
                  <th className="text-left py-2 px-3 font-medium">Email</th>
                  <th className="text-left py-2 px-3 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody>
                {contacts.slice(0, 10).map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5 px-3">{c.firstName} {c.lastName}</td>
                    <td className="py-1.5 px-3 text-blue-600">{c.email}</td>
                    <td className="py-1.5 px-3">{c.phone}</td>
                  </tr>
                ))}
                {contacts.length > 10 && (
                  <tr className="border-t">
                    <td colSpan={3} className="py-1.5 px-3 text-gray-400 italic">
                      ...and {contacts.length - 10} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Results */}
      {result && (
        <div>
          <div className={`rounded p-4 mb-4 ${result.dryRun ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'}`}>
            <p className="font-semibold text-sm mb-1">
              {result.dryRun ? '🔍 Dry Run Results' : '✅ Update Complete'}
            </p>
            <p className="text-sm">
              <strong>{result.summary.updated || result.summary.dryRunCount}</strong> agents would be {result.dryRun ? 'updated' : 'were updated'} &nbsp;·&nbsp;
              <strong className="text-red-600">{result.summary.noMatch}</strong> contacts had no matching profile
            </p>
          </div>

          {noMatchResults.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-red-600 mb-2">⚠️ No Profile Match ({noMatchResults.length})</h3>
              <div className="border rounded overflow-hidden">
                <table className="text-xs w-full border-collapse">
                  <thead className="bg-red-50">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Name</th>
                      <th className="text-left py-2 px-3 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noMatchResults.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1.5 px-3">{r.contact}</td>
                        <td className="py-1.5 px-3 text-blue-600">{r.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {updatedResults.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-green-700 mb-2">
                {result.dryRun ? '🔍 Would Update' : '✅ Updated'} ({updatedResults.length})
              </h3>
              <div className="border rounded overflow-hidden">
                <table className="text-xs w-full border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Name</th>
                      <th className="text-left py-2 px-3 font-medium">Email (new)</th>
                      <th className="text-left py-2 px-3 font-medium">Phone (new)</th>
                      <th className="text-left py-2 px-3 font-medium">Old Email</th>
                      <th className="text-left py-2 px-3 font-medium">Firebase Auth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {updatedResults.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1.5 px-3">{r.contact}</td>
                        <td className="py-1.5 px-3 text-blue-600">{r.email}</td>
                        <td className="py-1.5 px-3">{r.phone}</td>
                        <td className={`py-1.5 px-3 ${r.oldEmail === '(none)' ? 'text-red-500' : 'text-gray-400'}`}>{r.oldEmail}</td>
                        <td className={`py-1.5 px-3 ${r.firebaseUid === '(no auth account)' ? 'text-orange-500' : 'text-green-600'}`}>
                          {r.firebaseUid === '(no auth account)' ? '⚠️ No account' : '✅ ' + r.firebaseUid?.slice(0, 8) + '...'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
