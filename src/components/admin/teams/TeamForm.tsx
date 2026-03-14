'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase';

export type TeamFormValues = {
  teamName: string;
  leaderAgentId: string;
  teamPlanId: string;
  status: 'active' | 'inactive';
  office: string;
  notes: string;
};

type TeamFormProps = {
  teamId?: string;
  initialValues?: Partial<TeamFormValues>;
  submitLabel?: string;
};

const DEFAULT_VALUES: TeamFormValues = {
  teamName: '',
  leaderAgentId: '',
  teamPlanId: '',
  status: 'active',
  office: '',
  notes: '',
};

export default function TeamForm({
  teamId,
  initialValues,
  submitLabel = teamId ? 'Update Team' : 'Create Team',
}: TeamFormProps) {
  const router = useRouter();

  const [values, setValues] = useState<TeamFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  function updateField<K extends keyof TeamFormValues>(
    field: K,
    value: TeamFormValues[K]
  ) {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('You must be signed in to save this team.');
      }

      const token = await currentUser.getIdToken();
      const isEditMode = Boolean(teamId);

      const payload = {
        teamName: values.teamName.trim(),
        leaderAgentId: values.leaderAgentId.trim(),
        teamPlanId: values.teamPlanId.trim(),
        status: values.status,
        office: values.office.trim() || null,
        notes: values.notes.trim() || null,
      };

      const response = await fetch(
        isEditMode ? `/api/admin/teams/${teamId}` : '/api/admin/teams',
        {
          method: isEditMode ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error || (isEditMode ? 'Failed to update team.' : 'Failed to create team.')
        );
      }

      setSuccessMessage(isEditMode ? 'Team updated successfully.' : 'Team created successfully.');

      if (!isEditMode && result?.team?.teamId) {
        router.push(`/dashboard/admin/teams/${result.team.teamId}`);
        return;
      }

      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save team.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Team Details</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Team Name</span>
            <input
              value={values.teamName}
              onChange={(e) => updateField('teamName', e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Leader Agent ID</span>
            <input
              value={values.leaderAgentId}
              onChange={(e) => updateField('leaderAgentId', e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="jim-keaty"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Team Plan ID</span>
            <input
              value={values.teamPlanId}
              onChange={(e) => updateField('teamPlanId', e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="cgl-team-cgl-team-default"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select
              value={values.status}
              onChange={(e) => updateField('status', e.target.value as 'active' | 'inactive')}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Office</span>
            <input
              value={values.office}
              onChange={(e) => updateField('office', e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Notes</span>
            <textarea
              value={values.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="min-h-[100px] w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      {(errorMessage || successMessage) && (
        <div
          className={`rounded-lg border p-4 text-sm shadow-sm ${
            errorMessage
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {errorMessage || successMessage}
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
