/**
 * Cooperating-agent compensation is an offer/payment term, not SmartBroker's
 * listing-side gross commission. Keep its method and values independent so a
 * listing commission may remain percentage-based while the buyer-agent offer
 * is an exact dollar amount (or vice versa).
 */
export const COOPERATING_COMMISSION_FIELDS = [
  'cooperatingAgentCommissionMethod',
  'cooperatingAgentCommissionPercent',
  'cooperatingAgentCommissionFlatAmount',
] as const;

export type CooperatingCommissionMethod = 'percentage' | 'flat_dollar';

type TransactionLike = Record<string, any>;

function hasOwn(source: TransactionLike, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function asNumber(value: unknown, maximum?: number): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (maximum !== undefined && parsed > maximum)) {
    return null;
  }
  return Number(parsed.toFixed(2));
}

function resolveMethod(source: TransactionLike): CooperatingCommissionMethod {
  if (source.cooperatingAgentCommissionMethod === 'flat_dollar') return 'flat_dollar';
  if (source.cooperatingAgentCommissionMethod === 'percentage') return 'percentage';
  // Older records used the global commission mode for this one legacy value.
  return source.commissionMode === 'flat' ? 'flat_dollar' : 'percentage';
}

function resolveValues(source: TransactionLike) {
  const method = resolveMethod(source);
  const legacy = asNumber(source.sellerPayingBuyerAgent);
  return {
    method,
    percent: asNumber(source.cooperatingAgentCommissionPercent, 100) ?? (method === 'percentage' ? legacy : null),
    flatAmount: asNumber(source.cooperatingAgentCommissionFlatAmount) ?? (method === 'flat_dollar' ? legacy : null),
  };
}

function equalValues(a: unknown, b: unknown) {
  return a === b || (a == null && b == null);
}

/**
 * Returns the normalized canonical update and, only when compensation changed,
 * an immutable audit event. The caller writes the event in the same batch as
 * the canonical transaction update.
 */
export function buildCooperatingCommissionUpdate({
  current,
  proposed,
  actor,
}: {
  current: TransactionLike;
  proposed: TransactionLike;
  actor: { uid: string; name?: string | null; role: string };
}) {
  const closingType = String(proposed.closingType ?? current.closingType ?? '').toLowerCase();
  // Buyer-side seller-paid commission remains on its established legacy fields.
  // This Task 10 model is intentionally limited to transactions with a listing
  // representation side so blank form defaults can never erase buyer data.
  if (closingType !== 'listing' && closingType !== 'dual') {
    return { updates: {} as TransactionLike, auditEvent: null };
  }
  const isTouched = COOPERATING_COMMISSION_FIELDS.some((field) => hasOwn(proposed, field));
  if (!isTouched) return { updates: {} as TransactionLike, auditEvent: null };

  const before = resolveValues(current);
  const requestedMethod = proposed.cooperatingAgentCommissionMethod;
  if (requestedMethod !== undefined && requestedMethod !== null && requestedMethod !== '' &&
      requestedMethod !== 'percentage' && requestedMethod !== 'flat_dollar') {
    throw new Error('Cooperating-agent commission method must be percentage or flat_dollar');
  }
  const method: CooperatingCommissionMethod = requestedMethod === 'flat_dollar' || requestedMethod === 'percentage'
    ? requestedMethod
    : before.method;

  const percent = hasOwn(proposed, 'cooperatingAgentCommissionPercent')
    ? asNumber(proposed.cooperatingAgentCommissionPercent, 100)
    : before.percent;
  const flatAmount = hasOwn(proposed, 'cooperatingAgentCommissionFlatAmount')
    ? asNumber(proposed.cooperatingAgentCommissionFlatAmount)
    : before.flatAmount;

  const after = { method, percent, flatAmount };
  const activeValue = method === 'percentage' ? percent : flatAmount;
  const legacyBefore = asNumber(current.sellerPayingBuyerAgent);
  const changed = before.method !== after.method ||
    !equalValues(before.percent, after.percent) ||
    !equalValues(before.flatAmount, after.flatAmount);

  const updates: TransactionLike = {
    cooperatingAgentCommissionMethod: method,
    cooperatingAgentCommissionPercent: percent,
    cooperatingAgentCommissionFlatAmount: flatAmount,
    // Preserve this alias until the remaining legacy reads are migrated. It is
    // intentionally a mirror, never an independent source of truth.
    sellerPayingBuyerAgent: activeValue,
  };

  if (!changed) return { updates, auditEvent: null };

  const brokerage = String(
    proposed.otherAgentBrokerage ?? proposed.otherBrokerage ??
    current.otherAgentBrokerage ?? current.otherBrokerage ?? ''
  ).trim() || null;
  const hasInHouseCoAgent = Boolean(
    proposed.hasCoAgent ?? current.hasCoAgent ??
    proposed.coAgentId ?? current.coAgentId ??
    proposed.coAgent?.agentId ?? current.coAgent?.agentId
  );

  return {
    updates,
    auditEvent: {
      eventType: 'cooperating_agent_commission_changed',
      occurredAt: new Date().toISOString(),
      actor: {
        uid: actor.uid,
        name: actor.name || null,
        role: actor.role,
      },
      before: {
        ...before,
        legacySellerPayingBuyerAgent: legacyBefore,
      },
      after: {
        ...after,
        legacySellerPayingBuyerAgent: activeValue,
      },
      cooperatingParty: {
        category: hasInHouseCoAgent ? 'in_house' : (brokerage ? 'outside_brokerage' : 'unspecified'),
        brokerage,
      },
    },
  };
}
