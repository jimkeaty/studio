export type RecruitingCandidateStartInput = {
  status?: string | null;
  expectedStartDate?: string | null;
  actualStartDate?: string | null;
  agentProfileId?: string | null;
  name?: string | null;
};

export type RecruitingAgentProfileStartInput = {
  id?: string | null;
  agentId?: string | null;
  displayName?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
};

export type StartVerificationReason = 'actual_start_date' | 'active_agent_profile' | 'legacy_started' | 'scheduled_start_requires_verification' | null;

function ymd(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? match[0] : null;
}

function normalizedName(value: unknown) {
  return String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function profileName(profile: RecruitingAgentProfileStartInput) {
  return normalizedName(profile.displayName || profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`);
}

function hasActiveProfile(candidate: RecruitingCandidateStartInput, profiles: RecruitingAgentProfileStartInput[]) {
  const linkedProfileId = String(candidate.agentProfileId || '').trim();
  if (linkedProfileId) {
    return profiles.some(profile => [profile.id, profile.agentId].some(value => String(value || '') === linkedProfileId)
      && String(profile.status || '').trim().toLowerCase() === 'active');
  }
  const candidateName = normalizedName(candidate.name);
  if (!candidateName) return false;
  const matchingProfiles = profiles.filter(profile => profileName(profile) === candidateName);
  return matchingProfiles.length === 1 && String(matchingProfiles[0].status || '').trim().toLowerCase() === 'active';
}

/**
 * SBUSA-008: a scheduled date alone never proves a recruit started. Existing
 * Started records remain visible as historical records, while new transitions
 * require either an actual start date or an unambiguous active agent profile.
 */
export function verifyRecruitingStart(input: {
  candidate: RecruitingCandidateStartInput;
  profiles: RecruitingAgentProfileStartInput[];
  asOfDate: string;
}) {
  const status = String(input.candidate.status || 'prospect').trim().toLowerCase();
  const expectedStartDate = ymd(input.candidate.expectedStartDate);
  const actualStartDate = ymd(input.candidate.actualStartDate);
  const activeProfile = hasActiveProfile(input.candidate, input.profiles);

  if (status === 'started' && !actualStartDate && !activeProfile) {
    return { status: 'started', reason: 'legacy_started' as StartVerificationReason, warning: null };
  }
  if (actualStartDate && actualStartDate <= input.asOfDate) {
    return { status: 'started', reason: 'actual_start_date' as StartVerificationReason, warning: null };
  }
  if (activeProfile) {
    return { status: 'started', reason: 'active_agent_profile' as StartVerificationReason, warning: null };
  }
  if (status === 'scheduled_start' && expectedStartDate && expectedStartDate <= input.asOfDate) {
    return {
      status: 'scheduled_start',
      reason: 'scheduled_start_requires_verification' as StartVerificationReason,
      warning: 'Scheduled start date has passed. Confirm an actual start date or link the active agent profile before moving this recruit to Started.',
    };
  }
  return { status, reason: null as StartVerificationReason, warning: null };
}

export function isValidActualStartDate(value: unknown, asOfDate: string) {
  const date = ymd(value);
  return Boolean(date && date <= asOfDate);
}
