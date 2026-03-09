'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase';

export type AgentProfileFormValues = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  office: string;
  status: 'active' | 'inactive' | 'on_leave';
  startDate: string;
  compType: 'standard' | 'team' | 'salary' | 'referral' | 'special';
  defaultSplitPlanId: string;
  hasCustomSplitOverride: boolean;
  notes: string;
};

type AgentProfileFormProps = {
  agentId?: string;
  initialValues?: Partial<AgentProfileFormValues>;
  submitLabel?: string;
};

const STANDARD_SPLIT_PLANS = [
  { id: 'cgl_first_year', label: 'CGL First Year' },
  { id: 'cgl_standard', label: 'CGL Standard' },
  { id: 'sbl_team_standard', label: 'SBL Team Standard' },
  { id: 'salary_flat', label: 'Salary Flat' },
  { id: 'referral_flat', label: 'Referral Flat' },
];

const DEFAULT_VALUES: AgentProfileFormValues = {
  firstName: '',
  lastName: '',
  displayName: '',
  email: '',
  office: '',
  status: 'active',
  startDate: '',
  compType: 'standard',
  defaultSplitPlanId: 'cgl_standard',
  hasCustomSplitOverride: false,
  notes: '',
};

function formatAnniversary(startDate: string): string {
  if (!startDate) return '—';
  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

export default function AgentProfileForm({
  agentId,
  initialValues,
  submitLabel = 'Save Agent',
}: AgentProfileFormProps) {
  const router = useRouter();

  const [values, setValues] = useState<AgentProfileFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
    hasCustomSplitOverride:
      initialValues?.hasCustomSplitOverride ?? DEFAULT_VALUES.hasCustomSplitOverride,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const anniversaryDisplay = useMemo(() => {
    return formatAnniversary(values.startDate);
  }, [values.startDate]);

  function updateField<K extends keyof AgentProfileFormValues>(
    field: K,
    value: AgentProfileFormValues[K]
  ) {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSaving(true);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('You must be signed in to save agent profiles.');
      }

      const token = await currentUser.getIdToken();

      const payload = {
        firstName: values.firstName,
        lastName: values.lastName,
        displayName: values.displayName,
        email: values.email || null,
        office: values.office || null,
        status: values.status,
        startDate: values.startDate,
        compType: values.compType,
        defaultSplitPlanId: values.defaultSplitPlanId || null,
        hasCustomSplitOverride: values.hasCustomSplitOverride,
        notes: values.notes || null,
      };

      const isEditMode = Boolean(agentId);
      const endpoint = isEditMode
        ? `/api/admin/agent-profiles/${agentId}`
        : '/api/admin/agent-profiles';

      const method = isEditMode ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to save agent profile.');
      }

      const savedAgentId = result?.agent?.agentId || agentId;

      if (!isEditMode && savedAgentId) {
        router.push(`/dashboard/admin/agents/${savedAgentId}`);
        router.refresh();
        return;
      }

      setSuccessMessage('Agent profile saved successfully.');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Something went wrong while saving.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Basic Info</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">First Name</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              placeholder="Enter first name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Last Name</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              placeholder="Enter last name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Display Name</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
              placeholder="Enter display name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="Enter email"
              type="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Office</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.office}
              onChange={(e) => updateField('office', e.target.value)}
              placeholder="Enter office"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={values.status}
              onChange={(e) =>
                updateField(
                  'status',
                  e.target.value as AgentProfileFormValues['status']
                )
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Anniversary / Employment</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Start Date</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.startDate}
              onChange={(e) => updateField('startDate', e.target.value)}
              type="date"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Anniversary</label>
            <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
              {anniversaryDisplay}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Compensation Type
            </label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={values.compType}
              onChange={(e) =>
                updateField(
                  'compType',
                  e.target.value as AgentProfileFormValues['compType']
                )
              }
            >
              <option value="standard">Standard</option>
              <option value="team">Team</option>
              <option value="salary">Salary</option>
              <option value="referral">Referral</option>
              <option value="special">Special</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Commission Setup</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Standard Plan
            </label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={values.defaultSplitPlanId}
              onChange={(e) => updateField('defaultSplitPlanId', e.target.value)}
            >
              {STANDARD_SPLIT_PLANS.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={values.hasCustomSplitOverride}
                onChange={(e) =>
                  updateField('hasCustomSplitOverride', e.target.checked)
                }
              />
              Has Custom Split Override
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Notes</h2>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Admin Notes</label>
          <textarea
            className="min-h-28 w-full rounded-md border px-3 py-2"
            value={values.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Enter notes"
          />
        </div>
      </section>

      {(errorMessage || successMessage) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            errorMessage
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {errorMessage || successMessage}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm font-medium"
          onClick={() => router.push('/dashboard/admin/agents')}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
