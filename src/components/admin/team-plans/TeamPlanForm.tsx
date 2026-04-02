'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase';

export type TeamThresholdBandFormValue = {
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  leaderPercent: number;
  companyPercent: number;
};

export type MemberDefaultBandFormValue = {
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  memberPercent: number;
};

export type TeamPlanFormValues = {
  teamId: string;
  planName: string;
  status: 'active' | 'inactive';
  /** 'tiered' = progressive bands; 'fixed' = flat split on every transaction */
  commissionModelType: 'tiered' | 'fixed';
  /** Only used when commissionModelType === 'fixed' */
  fixedAgentPercent: number | string;
  fixedCompanyPercent: number | string;
  thresholdMetric: 'companyDollar';
  thresholdMarkers: number[];
  structureModel: 'leaderFirst';
  leaderStructureBands: TeamThresholdBandFormValue[];
  memberDefaultBands: MemberDefaultBandFormValue[];
  notes: string;
  /** Inherited from the parent team — controls whether Leader Structure Bands are shown */
  teamStructureType?: 'with_leader' | 'no_leader';
};

type TeamOption = {
  teamId: string;
  teamName: string;
  structureType: 'with_leader' | 'no_leader';
};

type TeamPlanFormProps = {
  teamPlanId?: string;
  initialValues?: Partial<TeamPlanFormValues>;
  submitLabel?: string;
  /** When true, hides the Leader Structure Bands section */
  isLeaderless?: boolean;
};

const DEFAULT_VALUES: TeamPlanFormValues = {
  teamId: '',
  planName: '',
  status: 'active',
  commissionModelType: 'tiered',
  fixedAgentPercent: 70,
  fixedCompanyPercent: 30,
  thresholdMetric: 'companyDollar',
  thresholdMarkers: [0, 45000, 90000, 180000, 240000],
  structureModel: 'leaderFirst',
  leaderStructureBands: [
    { fromCompanyDollar: 0, toCompanyDollar: 45000, leaderPercent: 70, companyPercent: 30 },
    { fromCompanyDollar: 45000, toCompanyDollar: 90000, leaderPercent: 75, companyPercent: 25 },
    { fromCompanyDollar: 90000, toCompanyDollar: 180000, leaderPercent: 80, companyPercent: 20 },
    { fromCompanyDollar: 180000, toCompanyDollar: 240000, leaderPercent: 85, companyPercent: 15 },
    { fromCompanyDollar: 240000, toCompanyDollar: null, leaderPercent: 90, companyPercent: 10 },
  ],
  memberDefaultBands: [
    { fromCompanyDollar: 0, toCompanyDollar: 45000, memberPercent: 45 },
    { fromCompanyDollar: 45000, toCompanyDollar: 90000, memberPercent: 50 },
    { fromCompanyDollar: 90000, toCompanyDollar: 180000, memberPercent: 55 },
    { fromCompanyDollar: 180000, toCompanyDollar: 240000, memberPercent: 60 },
    { fromCompanyDollar: 240000, toCompanyDollar: null, memberPercent: 65 },
  ],
  notes: '',
};

function cloneLeaderBands(values: TeamThresholdBandFormValue[]) {
  return values.map((item) => ({ ...item }));
}

function cloneMemberBands(values: MemberDefaultBandFormValue[]) {
  return values.map((item) => ({ ...item }));
}

function createEmptyLeaderBand(): TeamThresholdBandFormValue {
  return {
    fromCompanyDollar: 0,
    toCompanyDollar: null,
    leaderPercent: 0,
    companyPercent: 0,
  };
}

function createEmptyMemberBand(): MemberDefaultBandFormValue {
  return {
    fromCompanyDollar: 0,
    toCompanyDollar: null,
    memberPercent: 0,
  };
}

export default function TeamPlanForm({
  teamPlanId,
  initialValues,
  submitLabel = teamPlanId ? 'Update Team Plan' : 'Create Team Plan',
  isLeaderless = false,
}: TeamPlanFormProps) {
  const router = useRouter();
  const isEditMode = Boolean(teamPlanId);

  const [values, setValues] = useState<TeamPlanFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
    leaderStructureBands:
      initialValues?.leaderStructureBands && initialValues.leaderStructureBands.length > 0
        ? cloneLeaderBands(initialValues.leaderStructureBands)
        : cloneLeaderBands(DEFAULT_VALUES.leaderStructureBands),
    memberDefaultBands:
      initialValues?.memberDefaultBands && initialValues.memberDefaultBands.length > 0
        ? cloneMemberBands(initialValues.memberDefaultBands)
        : cloneMemberBands(DEFAULT_VALUES.memberDefaultBands),
    thresholdMarkers:
      initialValues?.thresholdMarkers && initialValues.thresholdMarkers.length > 0
        ? [...initialValues.thresholdMarkers]
        : [...DEFAULT_VALUES.thresholdMarkers],
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Team dropdown state (only used in create mode)
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  // In edit mode, isLeaderless comes from the parent; in create mode, derive from selected team
  const [selectedTeamStructure, setSelectedTeamStructure] = useState<'with_leader' | 'no_leader' | null>(null);

  // Effective leaderless flag: edit mode uses prop, create mode uses selected team
  const effectiveIsLeaderless = isEditMode ? isLeaderless : selectedTeamStructure === 'no_leader';

  const thresholdMarkersText = useMemo(
    () => values.thresholdMarkers.join(', '),
    [values.thresholdMarkers]
  );

  // Load team options for the dropdown (create mode only)
  useEffect(() => {
    if (isEditMode) return;
    let isMounted = true;
    const auth = getFirebaseAuth();
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user || !isMounted) return;
      try {
        setIsLoadingTeams(true);
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/teams', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data?.ok && Array.isArray(data.teams)) {
          if (isMounted) {
            setTeamOptions(
              data.teams.map((t: any) => ({
                teamId: t.teamId,
                teamName: t.teamName,
                structureType: t.structureType || 'with_leader',
              }))
            );
          }
        }
      } catch {
        // non-fatal
      } finally {
        if (isMounted) setIsLoadingTeams(false);
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isEditMode]);

  function handleTeamSelect(teamId: string) {
    updateField('teamId', teamId);
    const found = teamOptions.find((t) => t.teamId === teamId);
    setSelectedTeamStructure(found?.structureType ?? null);
  }

  function updateField<K extends keyof TeamPlanFormValues>(
    field: K,
    value: TeamPlanFormValues[K]
  ) {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateLeaderBand(
    index: number,
    field: keyof TeamThresholdBandFormValue,
    value: number | null
  ) {
    setValues((current) => {
      const next = cloneLeaderBands(current.leaderStructureBands);
      next[index] = {
        ...next[index],
        [field]: value,
      };
      return {
        ...current,
        leaderStructureBands: next,
      };
    });
  }

  function updateMemberBand(
    index: number,
    field: keyof MemberDefaultBandFormValue,
    value: number | null
  ) {
    setValues((current) => {
      const next = cloneMemberBands(current.memberDefaultBands);
      next[index] = {
        ...next[index],
        [field]: value,
      };
      return {
        ...current,
        memberDefaultBands: next,
      };
    });
  }

  function addLeaderBand() {
    setValues((current) => ({
      ...current,
      leaderStructureBands: [...current.leaderStructureBands, createEmptyLeaderBand()],
    }));
  }

  function removeLeaderBand(index: number) {
    setValues((current) => ({
      ...current,
      leaderStructureBands: current.leaderStructureBands.filter((_, i) => i !== index),
    }));
  }

  function addMemberBand() {
    setValues((current) => ({
      ...current,
      memberDefaultBands: [...current.memberDefaultBands, createEmptyMemberBand()],
    }));
  }

  function removeMemberBand(index: number) {
    setValues((current) => ({
      ...current,
      memberDefaultBands: current.memberDefaultBands.filter((_, i) => i !== index),
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
        throw new Error('You must be signed in to update this team plan.');
      }
      const token = await currentUser.getIdToken();
      const thresholdMarkers = thresholdMarkersText
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));
      const payload = {
        teamId: values.teamId.trim(),
        planName: values.planName.trim(),
        status: values.status,
        commissionModelType: values.commissionModelType,
        fixedSplit:
          values.commissionModelType === 'fixed'
            ? {
                agentPercent: Number(values.fixedAgentPercent || 0),
                companyPercent: Number(values.fixedCompanyPercent || 0),
              }
            : null,
        thresholdMetric: values.thresholdMetric,
        thresholdMarkers,
        structureModel: values.structureModel,
        leaderStructureBands: values.leaderStructureBands.map((band) => ({
          fromCompanyDollar: Number(band.fromCompanyDollar || 0),
          toCompanyDollar:
            band.toCompanyDollar === null || band.toCompanyDollar === undefined || String(band.toCompanyDollar) === ''
              ? null
              : Number(band.toCompanyDollar),
          leaderPercent: Number(band.leaderPercent || 0),
          companyPercent: Number(band.companyPercent || 0),
        })),
        memberDefaultBands: values.memberDefaultBands.map((band) => ({
          fromCompanyDollar: Number(band.fromCompanyDollar || 0),
          toCompanyDollar:
            band.toCompanyDollar === null || band.toCompanyDollar === undefined || String(band.toCompanyDollar) === ''
              ? null
              : Number(band.toCompanyDollar),
          memberPercent: Number(band.memberPercent || 0),
        })),
        notes: values.notes.trim() || null,
      };

      const response = await fetch(
        isEditMode ? `/api/admin/team-plans/${teamPlanId}` : '/api/admin/team-plans',
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
          result?.error || (isEditMode ? 'Failed to update team plan.' : 'Failed to create team plan.')
        );
      }

      setSuccessMessage(
        isEditMode ? 'Team plan updated successfully.' : 'Team plan created successfully.'
      );

      if (!isEditMode && result?.teamPlan?.teamPlanId) {
        router.push(`/dashboard/admin/team-plans/${result.teamPlan.teamPlanId}`);
        return;
      }

      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update team plan.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Team Plan Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">

          {/* Team selector — dropdown in create mode, read-only text in edit mode */}
          <div className="space-y-1">
            <span className="block text-sm font-medium text-gray-700">Team</span>
            {isEditMode ? (
              <input
                value={values.teamId}
                readOnly
                className="w-full rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            ) : (
              <>
                <select
                  value={values.teamId}
                  onChange={(e) => handleTeamSelect(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={isLoadingTeams}
                >
                  <option value="">
                    {isLoadingTeams ? 'Loading teams…' : 'Select a team'}
                  </option>
                  {teamOptions.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                      {t.structureType === 'no_leader' ? ' (No Leader)' : ' (Has Leader)'}
                    </option>
                  ))}
                </select>
                {selectedTeamStructure && (
                  <p className={`mt-1 text-xs font-medium ${selectedTeamStructure === 'no_leader' ? 'text-gray-600' : 'text-purple-700'}`}>
                    {selectedTeamStructure === 'no_leader'
                      ? 'This team has no leader — Leader Structure Bands are hidden.'
                      : 'This team has a leader — Leader Structure Bands are required.'}
                  </p>
                )}
              </>
            )}
          </div>

          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Plan Name</span>
            <input
              value={values.planName}
              onChange={(e) => updateField('planName', e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
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

          <div className="space-y-2 md:col-span-2">
            <span className="block text-sm font-medium text-gray-700">Commission Model Type</span>
            <div className="flex gap-6">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="commissionModelType"
                  value="tiered"
                  checked={values.commissionModelType === 'tiered'}
                  onChange={() => updateField('commissionModelType', 'tiered')}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="text-sm">
                  <strong>Tiered Commission</strong>
                  <span className="ml-1 text-gray-500">(progressive bands based on cumulative GCI)</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="commissionModelType"
                  value="fixed"
                  checked={values.commissionModelType === 'fixed'}
                  onChange={() => updateField('commissionModelType', 'fixed')}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="text-sm">
                  <strong>Fixed Commission</strong>
                  <span className="ml-1 text-gray-500">(flat split on every transaction, no tier progression)</span>
                </span>
              </label>
            </div>
            {values.commissionModelType === 'fixed' && (
              <div className="mt-3 grid gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Agent % <span className="text-red-500">*</span></span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={values.fixedAgentPercent}
                    onChange={(e) =>
                      updateField('fixedAgentPercent', e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="e.g. 70"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Company % <span className="text-red-500">*</span></span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={values.fixedCompanyPercent}
                    onChange={(e) =>
                      updateField('fixedCompanyPercent', e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="e.g. 30"
                  />
                </label>
                <p className="text-xs text-amber-700 md:col-span-2">
                  Fixed split is applied to every transaction. Tier bands below are ignored when this model is active.
                </p>
              </div>
            )}
          </div>

          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Threshold Markers</span>
            <input
              value={thresholdMarkersText}
              onChange={(e) =>
                updateField(
                  'thresholdMarkers',
                  e.target.value
                    .split(',')
                    .map((value) => Number(value.trim()))
                    .filter((value) => Number.isFinite(value))
                )
              }
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="0, 45000, 90000, 180000, 240000"
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

      {/* Leader Structure Bands — hidden for leaderless teams */}
      {!effectiveIsLeaderless && (
        <section className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Leader Structure Bands</h2>
              <p className="mt-1 text-sm text-gray-600">
                Defines the leader/company split before any member payout is applied.
              </p>
            </div>

            <button
              type="button"
              onClick={addLeaderBand}
              className="rounded-md border px-3 py-2 text-sm font-medium"
            >
              Add Leader Band
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {values.leaderStructureBands.map((band, index) => (
              <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-5">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">From</span>
                  <input
                    type="number"
                    value={band.fromCompanyDollar}
                    onChange={(e) =>
                      updateLeaderBand(index, 'fromCompanyDollar', Number(e.target.value || 0))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">To</span>
                  <input
                    type="number"
                    value={band.toCompanyDollar ?? ''}
                    onChange={(e) =>
                      updateLeaderBand(
                        index,
                        'toCompanyDollar',
                        e.target.value === '' ? null : Number(e.target.value)
                      )
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">Leader %</span>
                  <input
                    type="number"
                    value={band.leaderPercent}
                    onChange={(e) =>
                      updateLeaderBand(index, 'leaderPercent', Number(e.target.value || 0))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">Company %</span>
                  <input
                    type="number"
                    value={band.companyPercent}
                    onChange={(e) =>
                      updateLeaderBand(index, 'companyPercent', Number(e.target.value || 0))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeLeaderBand(index)}
                    className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                    disabled={values.leaderStructureBands.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{effectiveIsLeaderless ? 'Agent Payout Bands' : 'Member Default Bands'}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {effectiveIsLeaderless
                ? 'Defines the agent vs. company split for this leaderless team.'
                : 'Defines the default member payout from the leader side when no member-specific plan is assigned.'}
            </p>
          </div>

          <button
            type="button"
            onClick={addMemberBand}
            className="rounded-md border px-3 py-2 text-sm font-medium"
          >
            Add Member Band
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {values.memberDefaultBands.map((band, index) => (
            <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">From</span>
                <input
                  type="number"
                  value={band.fromCompanyDollar}
                  onChange={(e) =>
                    updateMemberBand(index, 'fromCompanyDollar', Number(e.target.value || 0))
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">To</span>
                <input
                  type="number"
                  value={band.toCompanyDollar ?? ''}
                  onChange={(e) =>
                    updateMemberBand(
                      index,
                      'toCompanyDollar',
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Member %</span>
                <input
                  type="number"
                  value={band.memberPercent}
                  onChange={(e) =>
                    updateMemberBand(index, 'memberPercent', Number(e.target.value || 0))
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => removeMemberBand(index)}
                  className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                  disabled={values.memberDefaultBands.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
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

      <div className="flex items-center justify-end gap-3">
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
