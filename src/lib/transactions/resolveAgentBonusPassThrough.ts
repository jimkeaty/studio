/**
 * Resolves an agent's share of a transaction-level bonus that bypasses all
 * commission, company revenue, production, and tier calculations.
 *
 * Bonuses are intentionally split equally between the primary agent and one
 * internal co-agent, regardless of the commission split on the transaction.
 */
type TransactionRecord = Record<string, any>;

function money(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : 0;
}

export function getAgentBonusPassThrough(
  transaction: TransactionRecord,
  agentId?: string | null,
): number {
  const totalBonus = money(transaction?.agentBonusPassThrough);
  if (totalBonus <= 0) return 0;

  const primaryAgentId = String(transaction?.agentId || '').trim();
  const coAgentId = String(transaction?.coAgent?.agentId || transaction?.coAgentId || '').trim();
  const hasInternalCoAgent = Boolean(transaction?.hasCoAgent && coAgentId);

  // A form-level preview with no specific participant always shows the full
  // transaction amount; participant-specific calls return the assigned share.
  if (!agentId) return totalBonus;
  const normalizedAgentId = String(agentId).trim();

  if (!hasInternalCoAgent) {
    return !primaryAgentId || normalizedAgentId === primaryAgentId ? totalBonus : 0;
  }

  const coAgentShare = money(totalBonus / 2);
  const primaryAgentShare = money(totalBonus - coAgentShare);
  if (normalizedAgentId === coAgentId) return coAgentShare;
  if (normalizedAgentId === primaryAgentId) return primaryAgentShare;
  return 0;
}
