import { addDays, centralParts } from '@/lib/attendance/rules';

export type OperationalMeetingCategory =
  | 'new_agent_90_day'
  | 'no_production_or_pending_last_60_days'
  | 'under_one_year';

export type OperationalMeetingAgentInput = {
  agentId: string;
  name: string;
  status?: string | null;
  teamGroup?: string | null;
  startDate?: string | null;
  identityKeys?: Array<string | null | undefined>;
};

export type OperationalMeetingTransactionInput = {
  id?: string;
  agentId?: string | null;
  coAgentId?: string | null;
  coAgent?: { agentId?: string | null } | null;
  status?: string | null;
  closedDate?: string | null;
  closingDate?: string | null;
  contractDate?: string | null;
  underContractDate?: string | null;
  pendingDate?: string | null;
};

export type OperationalMeetingAgent = {
  agentId: string;
  name: string;
  startDate: string | null;
  teamGroup: string;
  tenureDay: number | null;
  category: OperationalMeetingCategory | null;
  activityInLast60Days: Array<{ transactionId: string; kind: 'closed' | 'pending'; date: string }>;
};

export type OperationalMeetingEligibilityResult = {
  asOfDate: string;
  sixtyDayWindowStart: string;
  activeAgents: OperationalMeetingAgent[];
  quarterlyStrategyAgents: OperationalMeetingAgent[];
  operational: Record<OperationalMeetingCategory, OperationalMeetingAgent[]>;
  excluded: Array<{ agentId: string; name: string; reason: string }>;
};

const INACTIVE_STATUSES = new Set(['inactive', 'out', 'terminated', 'churned']);
const OPERATIONAL_TEAM_GROUPS = new Set(['cgl', 'charles_ditch_team']);

function normalizeYmd(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }
  if (typeof (value as any).toDate === 'function') {
    return (value as any).toDate().toISOString().slice(0, 10);
  }
  return null;
}

function daysInclusive(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function isActive(status: string | null | undefined): boolean {
  return !INACTIVE_STATUSES.has(String(status || 'active').trim().toLowerCase());
}

function transactionActivity(
  transaction: OperationalMeetingTransactionInput,
  agentKeys: Set<string>,
  windowStart: string,
  asOfDate: string,
): { transactionId: string; kind: 'closed' | 'pending'; date: string } | null {
  const participantIds = [transaction.agentId, transaction.coAgentId, transaction.coAgent?.agentId]
    .filter(Boolean)
    .map(value => String(value));
  if (!participantIds.some(id => agentKeys.has(id))) return null;

  const status = String(transaction.status || '').trim().toLowerCase();
  const isClosed = status === 'closed';
  const isPending = status === 'pending' || status === 'under_contract';
  if (!isClosed && !isPending) return null;

  const date = isClosed
    ? normalizeYmd(transaction.closedDate) || normalizeYmd(transaction.closingDate)
    : normalizeYmd(transaction.contractDate) || normalizeYmd(transaction.underContractDate) || normalizeYmd(transaction.pendingDate);
  if (!date || date < windowStart || date > asOfDate) return null;

  return {
    transactionId: String(transaction.id || `${participantIds.join('|')}:${date}`),
    kind: isClosed ? 'closed' : 'pending',
    date,
  };
}

/**
 * Canonical SBUSA-002 operational 1:1 assignment. Quarterly strategy is intentionally
 * separate: every active agent is eligible for it, regardless of operational team group.
 */
export function calculateOperationalMeetingEligibility(input: {
  agents: OperationalMeetingAgentInput[];
  transactions: OperationalMeetingTransactionInput[];
  asOfDate?: string;
}): OperationalMeetingEligibilityResult {
  const asOfDate = input.asOfDate || centralParts().date;
  const sixtyDayWindowStart = addDays(asOfDate, -59);
  const activeAgents: OperationalMeetingAgent[] = [];
  const quarterlyStrategyAgents: OperationalMeetingAgent[] = [];
  const excluded: OperationalMeetingEligibilityResult['excluded'] = [];
  const operational: OperationalMeetingEligibilityResult['operational'] = {
    new_agent_90_day: [],
    no_production_or_pending_last_60_days: [],
    under_one_year: [],
  };

  for (const agent of input.agents) {
    const startDate = normalizeYmd(agent.startDate);
    const normalizedTeamGroup = String(agent.teamGroup || '').trim().toLowerCase();
    if (!isActive(agent.status)) {
      excluded.push({ agentId: agent.agentId, name: agent.name, reason: 'inactive_lifecycle_status' });
      continue;
    }
    if (startDate && startDate > asOfDate) {
      excluded.push({ agentId: agent.agentId, name: agent.name, reason: 'future_start_date' });
      continue;
    }

    const tenureDay = startDate ? daysInclusive(startDate, asOfDate) : null;
    const baseAgent: OperationalMeetingAgent = {
      agentId: agent.agentId,
      name: agent.name,
      startDate,
      teamGroup: normalizedTeamGroup,
      tenureDay,
      category: null,
      activityInLast60Days: [],
    };
    quarterlyStrategyAgents.push(baseAgent);

    if (!OPERATIONAL_TEAM_GROUPS.has(normalizedTeamGroup)) {
      excluded.push({ agentId: agent.agentId, name: agent.name, reason: 'outside_operational_team_scope' });
      continue;
    }
    if (!startDate || tenureDay === null) {
      excluded.push({ agentId: agent.agentId, name: agent.name, reason: 'missing_start_date' });
      continue;
    }

    const keys = new Set([agent.agentId, ...(agent.identityKeys || [])].filter(Boolean).map(value => String(value)));
    const activity = input.transactions
      .map(transaction => transactionActivity(transaction, keys, sixtyDayWindowStart, asOfDate))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item, index, items) => items.findIndex(candidate => candidate.transactionId === item.transactionId) === index)
      .sort((a, b) => b.date.localeCompare(a.date));

    let category: OperationalMeetingCategory;
    if (tenureDay <= 90) {
      category = 'new_agent_90_day';
    } else if (activity.length === 0) {
      category = 'no_production_or_pending_last_60_days';
    } else {
      category = 'under_one_year';
    }

    // Only agents through their first year receive an operational category after day 90.
    if (category === 'under_one_year' && tenureDay > 365) continue;
    if (category === 'no_production_or_pending_last_60_days' && tenureDay > 365) {
      // The locked rule assigns no-production precedence before Under One Year;
      // established eligible CGL/Charles agents remain operationally actionable as no-production.
    }

    const categorized = { ...baseAgent, category, activityInLast60Days: activity };
    activeAgents.push(categorized);
    operational[category].push(categorized);
  }

  return { asOfDate, sixtyDayWindowStart, activeAgents, quarterlyStrategyAgents, operational, excluded };
}
