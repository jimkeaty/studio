'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Clock, AlertTriangle, CalendarCheck, Home, User, Ruler } from 'lucide-react';

type RequestData = {
  status: 'pending' | 'confirmed' | 'taken' | 'expired';
  inspectionType?: string;
  propertyAddress?: string;
  clientName?: string;
  agentName?: string;
  agentPhone?: string;
  agentEmail?: string;
  sqft?: string;
  accessNotes?: string;
  preferredDate?: string;
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
  fallbackDateStart?: string;
  fallbackDateEnd?: string;
  isBlast?: boolean;
  alreadyConfirmed?: boolean;
  taken?: boolean;
  expired?: boolean;
};

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(d: string) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(d: string) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Generate 30-minute time slots from 7am to 7pm
function generateTimeSlots() {
  const slots: { value: string; label: string }[] = [];
  for (let h = 7; h <= 19; h++) {
    for (const m of [0, 30]) {
      if (h === 19 && m === 30) break;
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const label = formatTime(value);
      slots.push({ value, label });
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

export default function InspectSchedulingPage() {
  const params = useParams();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RequestData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string; taken?: boolean } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/agent/inspection-request/confirm?token=${token}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        // Pre-fill preferred date
        if (d.preferredDate) setSelectedDate(d.preferredDate);
      })
      .catch(() => setError('Failed to load request. Please try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/agent/inspection-request/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, confirmedDate: selectedDate, confirmedTime: selectedTime }),
      });
      const result = await res.json();
      setSubmitResult(result);
      setSubmitted(true);
    } catch {
      setSubmitResult({ ok: false, message: 'Something went wrong. Please try again.' });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your inspection request…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <PageShell>
        <StatusCard
          icon={<AlertTriangle className="h-12 w-12 text-red-500" />}
          title="Link Not Found"
          message={error || 'This scheduling link is invalid or has expired.'}
          color="red"
        />
      </PageShell>
    );
  }

  // ── Already confirmed ──────────────────────────────────────────────────────
  if (data.status === 'confirmed' || data.alreadyConfirmed) {
    return (
      <PageShell>
        <StatusCard
          icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
          title="Already Confirmed"
          message="This inspection has already been scheduled. Thank you!"
          color="green"
        />
      </PageShell>
    );
  }

  // ── Taken by another inspector ─────────────────────────────────────────────
  if (data.status === 'taken' || data.taken) {
    return (
      <PageShell>
        <StatusCard
          icon={<CheckCircle2 className="h-12 w-12 text-blue-500" />}
          title="Inspection Assigned"
          message="This inspection has already been assigned to another inspector. Thank you for your response!"
          color="blue"
        />
      </PageShell>
    );
  }

  // ── Expired ────────────────────────────────────────────────────────────────
  if (data.status === 'expired' || data.expired) {
    return (
      <PageShell>
        <StatusCard
          icon={<Clock className="h-12 w-12 text-gray-400" />}
          title="Link Expired"
          message="This scheduling link has expired. Please contact the agent directly."
          color="gray"
        />
      </PageShell>
    );
  }

  // ── Submitted ──────────────────────────────────────────────────────────────
  if (submitted && submitResult) {
    if (submitResult.ok) {
      return (
        <PageShell>
          <StatusCard
            icon={<CalendarCheck className="h-12 w-12 text-green-500" />}
            title="Availability Confirmed!"
            message={submitResult.message}
            color="green"
            extra={
              <div className="mt-4 p-4 bg-green-50 rounded-lg text-sm text-green-800 space-y-1">
                <p><strong>Date:</strong> {formatDate(selectedDate)}</p>
                <p><strong>Time:</strong> {formatTime(selectedTime)}</p>
                <p><strong>Property:</strong> {data.propertyAddress}</p>
              </div>
            }
          />
        </PageShell>
      );
    }
    if (submitResult.taken) {
      return (
        <PageShell>
          <StatusCard
            icon={<CheckCircle2 className="h-12 w-12 text-blue-500" />}
            title="Already Assigned"
            message={submitResult.message}
            color="blue"
          />
        </PageShell>
      );
    }
    return (
      <PageShell>
        <StatusCard
          icon={<AlertTriangle className="h-12 w-12 text-red-500" />}
          title="Something Went Wrong"
          message={submitResult.message}
          color="red"
        />
      </PageShell>
    );
  }

  // ── Main scheduling form ───────────────────────────────────────────────────
  const minDate = data.fallbackDateStart || new Date().toISOString().split('T')[0];
  const maxDate = data.fallbackDateEnd || '';

  return (
    <PageShell>
      <div className="w-full max-w-lg mx-auto">
        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="bg-blue-700 px-6 py-5">
            <p className="text-white text-xl font-bold">Inspection Request</p>
            <p className="text-blue-200 text-sm mt-1">{data.inspectionType}</p>
          </div>
          <div className="px-6 py-5 space-y-3">
            {data.isBlast && (
              <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>This request was sent to multiple inspectors. The first to confirm will be assigned.</span>
              </div>
            )}
            <InfoRow icon={<Home className="h-4 w-4" />} label="Property" value={data.propertyAddress || '—'} />
            {data.sqft && <InfoRow icon={<Ruler className="h-4 w-4" />} label="Sq Ft" value={data.sqft} />}
            {data.clientName && <InfoRow icon={<User className="h-4 w-4" />} label="Client" value={data.clientName} />}
            {data.accessNotes && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <strong>Access Notes:</strong> {data.accessNotes}
              </div>
            )}
          </div>
        </div>

        {/* Preferred schedule */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-5 mb-4">
          <h3 className="font-semibold text-gray-900 mb-3">Requested Schedule</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Preferred Date</span>
              <span className="font-medium text-gray-900">{data.preferredDate ? formatDateShort(data.preferredDate) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Preferred Time</span>
              <span className="font-medium text-gray-900">
                {data.preferredTimeStart && data.preferredTimeEnd
                  ? `${formatTime(data.preferredTimeStart)} – ${formatTime(data.preferredTimeEnd)}`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Available Range</span>
              <span className="font-medium text-gray-900">
                {data.fallbackDateStart && data.fallbackDateEnd
                  ? `${formatDateShort(data.fallbackDateStart)} – ${formatDateShort(data.fallbackDateEnd)}`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Time selection */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-5 mb-4">
          <h3 className="font-semibold text-gray-900 mb-1">Confirm Your Availability</h3>
          <p className="text-sm text-gray-500 mb-4">
            Select the date and time that works best for you within the available range.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={selectedDate}
                min={minDate}
                max={maxDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <select
                value={selectedTime}
                onChange={e => setSelectedTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a time…</option>
                {TIME_SLOTS.map(slot => (
                  <option key={slot.value} value={slot.value}>{slot.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selectedDate || !selectedTime || submitting}
          className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-2xl text-base transition-colors"
        >
          {submitting ? 'Confirming…' : 'Confirm My Availability'}
        </button>

        {/* Agent contact */}
        {(data.agentName || data.agentPhone || data.agentEmail) && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Questions? Contact {data.agentName || 'the agent'}
            {data.agentPhone && <> at <a href={`tel:${data.agentPhone}`} className="text-blue-600">{data.agentPhone}</a></>}
            {data.agentEmail && <> or <a href={`mailto:${data.agentEmail}`} className="text-blue-600">{data.agentEmail}</a></>}.
          </div>
        )}
      </div>
    </PageShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      {/* Branded header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 mb-1">
          <img src="/icon-512.png" alt="Logo" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-bold text-gray-900">Keaty Real Estate</span>
        </div>
      </div>
      {children}
      <p className="text-center text-xs text-gray-400 mt-8">
        © {new Date().getFullYear()} Keaty Real Estate
      </p>
    </div>
  );
}

function StatusCard({
  icon, title, message, color, extra,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  color: 'green' | 'blue' | 'red' | 'gray';
  extra?: React.ReactNode;
}) {
  const bg = { green: 'bg-green-50', blue: 'bg-blue-50', red: 'bg-red-50', gray: 'bg-gray-100' }[color];
  return (
    <div className={`w-full max-w-md mx-auto ${bg} rounded-2xl p-8 text-center shadow-sm`}>
      <div className="flex justify-center mb-4">{icon}</div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-600 text-sm">{message}</p>
      {extra}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <span className="text-gray-500 w-16 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}
