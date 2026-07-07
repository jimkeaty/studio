'use client';
import { useState } from 'react';
import { useUser } from '@/firebase';

export default function TestSmsPage() {
  const { user } = useUser();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function sendTest() {
    if (!phone.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/test-sms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber: phone.trim() }),
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

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">SMS Test</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Send a test SMS to verify your A2P certified Twilio number is working correctly.
        Enter any phone number (including your own) to receive a test message.
      </p>

      <div className="border rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+13375551234"
            className="w-full border rounded px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">Include country code, e.g. +1 for US numbers</p>
        </div>

        <button
          onClick={sendTest}
          disabled={loading || !phone.trim()}
          className="w-full bg-blue-600 text-white py-2 rounded font-medium text-sm disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Test SMS'}
        </button>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium text-sm mb-1">❌ SMS Failed</p>
          <p className="text-red-600 text-sm">{error}</p>
          {error.includes('TWILIO_') && (
            <p className="text-red-500 text-xs mt-2">
              Twilio environment variables are missing. Make sure TWILIO_ACCOUNT_SID,
              TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are set in Firebase App Hosting secrets.
            </p>
          )}
          {error.includes('21608') && (
            <p className="text-red-500 text-xs mt-2">
              Error 21608: The phone number is not verified for trial accounts, or the A2P registration
              is still pending. Check your Twilio console for the exact status.
            </p>
          )}
          {error.includes('21614') && (
            <p className="text-red-500 text-xs mt-2">
              Error 21614: &apos;To&apos; number is not a valid mobile number. Make sure to include the
              country code (+1 for US).
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-700 font-medium text-sm mb-3">✅ SMS Sent Successfully!</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">From</span>
              <span className="font-mono">{result.from}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">To</span>
              <span className="font-mono">{result.to}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="font-medium capitalize">{result.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Message SID</span>
              <span className="font-mono text-xs">{result.messageSid}</span>
            </div>
          </div>
          <p className="text-green-600 text-xs mt-3">
            Check your phone — the message should arrive within a few seconds.
            If it arrives, your A2P number is fully working and all SMS notifications are live.
          </p>
        </div>
      )}
    </div>
  );
}
