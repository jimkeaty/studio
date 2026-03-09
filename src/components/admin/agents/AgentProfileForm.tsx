'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase';

export type AgentType = 'CGL' | 'SGL' | 'TeamMember' | 'TeamLeader';
export type ProgressionMetric = 'companyDollar';
export type TeamRole = 'leader' | 'member' | null;
export type PlanAssignmentType = 'individual' | 'teamMember' | 'teamLeader';

export type AgentTierFormValue = {
  tierName: string;
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  agentSplitPercent: number;
  companySplitPercent: number;
  notes: string;
};

export type AgentProfileFormValues = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  office: string;
  status: 'active' | 'inactive' | 'on_leave';
  startDate: string;
  agentType: AgentType;
  progressionMetric: ProgressionMetric;
  primaryTeamId: string;
  teamRole: TeamRole;
  defaultPlanType: PlanAssignmentType;
  defaultPlanId: string;
  tiers: AgentTierFormValue[];
  notes: string;
};

type AgentProfileFormProps = {
  agentId?: string;
  initialValues?: Partial<AgentProfileFormValues>;
  submitLabel?: string;
};

const DEFAULT_CGL_TIERS: AgentTierFormValue[] = [
  {
    tierName: 'First Year',
    fromCompanyDollar: 0,
    toCompanyDollar: null,
    agentSplitPercent: 50,
    companySplitPercent: 50,
    notes: 'First-year agent',
  },
  {
    tierName: 'Tier 1',
    fromCompanyDollar: 0,
    toCompanyDollar: 45000,
    agentSplitPercent: 55,
    companySplitPercent: 45,
    notes: '',
  },
  {
    tierName: 'Tier 2',
    fromCompanyDollar: 45000,
    toCompanyDollar: 90000,
    agentSplitPercent: 60,
    companySplitPercent: 40,
    notes: '',
  },
  {
    tierName: 'Tier 3',
    fromCompanyDollar: 90000,
    toCompanyDollar: 180000,
    agentSplitPercent: 70,
    companySplitPercent: 30,
    notes: '',
  },
  {
    tierName: 'Tier 4',
    fromCompanyDollar: 180000,
    toCompanyDollar: 240000,
    agentSplitPercent: 80,
    companySplitPercent: 20,
    notes: '',
  },
  {
    tierName: 'Tier 5',
    fromCompanyDollar: 240000,
    toCompanyDollar: null,
    agentSplitPercent: 90,
    companySplitPercent: 10,
    notes: '',
  },
];

const DEFAULT_SGL_TIERS: AgentTierFormValue[] = [
  {
    tierName: 'Tier 1',
    fromCompanyDollar: 0,
    toCompanyDollar: 240000,
    agentSplitPercent: 70,
    companySplitPercent: 30,
    notes: '',
  },
  {
    tierName: 'Tier 2',
    fromCompanyDollar: 240000,
    toCompanyDollar: null,
    agentSplitPercent: 90,
    companySplitPercent: 10,
    notes: '',
  },
];

const DEFAULT_TEAM_MEMBER_TIERS: AgentTierFormValue[] = [];
const DEFAULT_TEAM_LEADER_TIERS: AgentTierFormValue[] = [];

const DEFAULT_VALUES: AgentProfileFormValues = {
  firstName: '',
  lastName: '',
  displayName: '',
  email: '',
  office: '',
  status: 'active',
  startDate: '',
  agentType: 'CGL',
  progressionMetric: 'companyDollar',
  primaryTeamId: '',
  teamRole: null,
  defaultPlanType: 'individual',
  defaultPlanId: '',
  tiers: DEFAULT_CGL_TIERS,
  notes: '',
};

function cloneTiers(tiers: AgentTierFormValue[]) {
  return tiers.map((tier) => ({
    ...tier,
    notes: tier.notes || '',
  }));
}

function getDefaultTiers(agentType: AgentType): AgentTierFormValue[] {
  switch (agentType) {
    case 'CGL':
      return cloneTiers(DEFAULT_CGL_TIERS);
    case 'SGL':
      return cloneTiers(DEFAULT_SGL_TIERS);
    case 'TeamMember':
      return cloneTiers(DEFAULT_TEAM_MEMBER_TIERS);
    case 'TeamLeader':
      return cloneTiers(DEFAULT_TEAM_LEADER_TIERS);
    default:
      return cloneTiers(DEFAULT_CGL_TIERS);
  }
}

function isIndividualAgentType(agentType: AgentType) {
  return agentType === 'CGL' || agentType === 'SGL';
}

function getDefaultTeamRole(agentType: AgentType): TeamRole {
  if (agentType === 'TeamLeader') return 'leader';
  if (agentType === 'TeamMember') return 'member';
  return null;
}

function getDefaultPlanType(agentType: AgentType): PlanAssignmentType {
  if (agentType === 'TeamLeader') return 'teamLeader';
  if (agentType === 'TeamMember') return 'teamMember';
  return 'individual';
}

function formatAnniversary(startDate: string): string {
  if (!startDate) return '—';
  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

function createEmptyTier(nextIndex: number): AgentTierFormValue {
  return {
    tierName: `Tier ${nextIndex}`,
    fromCompanyDollar: 0,
    toCompanyDollar: null,
    agentSplitPercent: 0,
    companySplitPercent: 0,
    notes: '',
  };
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
    progressionMetric: 'companyDollar',
    tiers:
      initialValues?.tiers && initialValues.tiers.length > 0
        ? cloneTiers(initialValues.tiers)
        : cloneTiers(DEFAULT_VALUES.tiers),
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!initialValues) return;

    setValues({
      ...DEFAULT_VALUES,
      ...initialValues,
      progressionMetric: 'companyDollar',
      tiers:
        initialValues.tiers && initialValues.tiers.length > 0
          ? cloneTiers(initialValues.tiers)
          : getDefaultTiers((initialValues.agentType as AgentType) || 'CGL'),
    });
  }, [initialValues]);

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

  function updateAgentType(nextType: AgentType) {
    setValues((prev) => ({
      ...prev,
      agentType: nextType,
      progressionMetric: 'companyDollar',
      teamRole: getDefaultTeamRole(nextType),
      defaultPlanType: getDefaultPlanType(nextType),
      defaultPlanId: isIndividualAgentType(nextType) ? '' : prev.defaultPlanId,
      primaryTeamId: isIndividualAgentType(nextType) ? '' : prev.primaryTeamId,
      tiers: getDefaultTiers(nextType),
    }));
  }

  function updateTier(
    index: number,
    field: keyof AgentTierFormValue,
    value: string | number | null
  ) {
    setValues((prev) => {
      const nextTiers = [...prev.tiers];
      nextTiers[index] = {
        ...nextTiers[index],
        [field]: value,
      } as AgentTierFormValue;

      return {
        ...prev,
        tiers: nextTiers,
      };
    });
  }

  function addTier() {
    setValues((prev) => ({
      ...prev,
      tiers: [...prev.tiers, createEmptyTier(prev.tiers.length + 1)],
    }));
  }

  function removeTier(index: number) {
    setValues((prev) => {
      if (prev.tiers.length <= 1) return prev;
      return {
        ...prev,
        tiers: prev.tiers.filter((_, i) => i !== index),
      };
    });
  }

  function resetToDefaults() {
    setValues((prev) => ({
      ...prev,
      progressionMetric: 'companyDollar',
      teamRole: getDefaultTeamRole(prev.agentType),
      defaultPlanType: getDefaultPlanType(prev.agentType),
      tiers: getDefaultTiers(prev.agentType),
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
        agentType: values.agentType,
        progressionMetric: 'companyDollar',
        primaryTeamId: values.primaryTeamId || null,
        teamRole: values.teamRole,
        defaultPlanType: values.defaultPlanType,
        defaultPlanId: values.defaultPlanId || null,
        tiers: isIndividualAgentType(values.agentType)
          ? values.tiers.map((tier) => ({
              tierName: tier.tierName,
              fromCompanyDollar: Number(tier.fromCompanyDollar || 0),
              toCompanyDollar:
                tier.toCompanyDollar === null || tier.toCompanyDollar === ''
                  ? null
                  : Number(tier.toCompanyDollar),
              agentSplitPercent: Number(tier.agentSplitPercent || 0),
              companySplitPercent: Number(tier.companySplitPercent || 0),
              notes: tier.notes || null,
            }))
          : [],
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
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Commission Setup</h2>
            <p className="mt-1 text-sm text-gray-600">
              Select the agent type and adjust tiers as needed.
            </p>
          </div>

          <button
            type="button"
            onClick={resetToDefaults}
            className="rounded-md border px-3 py-2 text-sm font-medium"
          >
            Reset Defaults
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Agent Type</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={values.agentType}
              onChange={(e) => updateAgentType(e.target.value as AgentType)}
            >
              <option value="CGL">CGL</option>
              <option value="SGL">SGL</option>
              <option value="TeamMember">Team Member</option>
              <option value="TeamLeader">Team Leader</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Progression Metric
            </label>
            <input
              className="w-full rounded-md border bg-gray-50 px-3 py-2"
              value="Company Dollar In"
              readOnly
            />
          </div>
        </div>

        {!isIndividualAgentType(values.agentType) && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Primary Team ID</label>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={values.primaryTeamId}
                onChange={(e) => updateField('primaryTeamId', e.target.value)}
                placeholder="Enter team ID"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                {values.agentType === 'TeamLeader' ? 'Leader Plan ID' : 'Member Plan ID'}
              </label>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={values.defaultPlanId}
                onChange={(e) => updateField('defaultPlanId', e.target.value)}
                placeholder={
                  values.agentType === 'TeamLeader'
                    ? 'Enter leader plan ID'
                    : 'Enter member plan ID'
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Resolved Team Role</label>
              <input
                className="w-full rounded-md border bg-gray-50 px-3 py-2"
                value={values.teamRole || ''}
                readOnly
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Resolved Plan Type</label>
              <input
                className="w-full rounded-md border bg-gray-50 px-3 py-2"
                value={values.defaultPlanType}
                readOnly
              />
            </div>
          </div>
        )}

        {isIndividualAgentType(values.agentType) && (
        <>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-3 py-2 text-left">Tier Name</th>
                <th className="border px-3 py-2 text-left">From Company $</th>
                <th className="border px-3 py-2 text-left">To Company $</th>
                <th className="border px-3 py-2 text-left">Agent %</th>
                <th className="border px-3 py-2 text-left">Company %</th>
                <th className="border px-3 py-2 text-left">Notes</th>
                <th className="border px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {values.tiers.map((tier, index) => (
                <tr key={`${tier.tierName}-${index}`}>
                  <td className="border px-3 py-2">
                    <input
                      className="w-full rounded-md border px-2 py-1"
                      value={tier.tierName}
                      onChange={(e) => updateTier(index, 'tierName', e.target.value)}
                    />
                  </td>
                  <td className="border px-3 py-2">
                    <input
                      className="w-full rounded-md border px-2 py-1"
                      type="number"
                      value={tier.fromCompanyDollar}
                      onChange={(e) =>
                        updateTier(index, 'fromCompanyDollar', Number(e.target.value))
                      }
                    />
                  </td>
                  <td className="border px-3 py-2">
                    <input
                      className="w-full rounded-md border px-2 py-1"
                      type="number"
                      value={tier.toCompanyDollar ?? ''}
                      onChange={(e) =>
                        updateTier(
                          index,
                          'toCompanyDollar',
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                      placeholder="No max"
                    />
                  </td>
                  <td className="border px-3 py-2">
                    <input
                      className="w-full rounded-md border px-2 py-1"
                      type="number"
                      value={tier.agentSplitPercent}
                      onChange={(e) =>
                        updateTier(index, 'agentSplitPercent', Number(e.target.value))
                      }
                    />
                  </td>
                  <td className="border px-3 py-2">
                    <input
                      className="w-full rounded-md border px-2 py-1"
                      type="number"
                      value={tier.companySplitPercent}
                      onChange={(e) =>
                        updateTier(index, 'companySplitPercent', Number(e.target.value))
                      }
                    />
                  </td>
                  <td className="border px-3 py-2">
                    <input
                      className="w-full rounded-md border px-2 py-1"
                      value={tier.notes}
                      onChange={(e) => updateTier(index, 'notes', e.target.value)}
                    />
                  </td>
                  <td className="border px-3 py-2">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1 text-sm"
                      onClick={() => removeTier(index)}
                      disabled={values.tiers.length <= 1}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            onClick={addTier}
          >
            Add Tier
          </button>
        </div>
        </>
        )}
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

      {!isIndividualAgentType(values.agentType) &&
        (!values.primaryTeamId || !values.defaultPlanId) && (
          <p className="text-sm text-amber-700">
            Team-based agents require both a Primary Team ID and a Plan ID before saving.
          </p>
        )}

      {isIndividualAgentType(values.agentType) && values.tiers.length === 0 && (
        <p className="text-sm text-amber-700">
          Add at least one tier before saving this profile.
        </p>
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
          disabled={
            isSaving ||
            (isIndividualAgentType(values.agentType) && values.tiers.length === 0) ||
            (!isIndividualAgentType(values.agentType) &&
              (!values.primaryTeamId || !values.defaultPlanId))
          }
        >
          {isSaving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
