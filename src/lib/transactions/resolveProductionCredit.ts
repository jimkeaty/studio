type TransactionLike = Record<string, any>;

export type ProductionCredit = {
  closedSides: number;
  pendingSides: number;
  volumeMultiplier: number;
  usesExplicitSideRole: boolean;
};

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRole(value: unknown): string {
  return String(value || 'other').trim().toLowerCase();
}

function isDual(tx: TransactionLike): boolean {
  return String(tx.closingType || '').trim().toLowerCase() === 'dual';
}

/**
 * Total production credit for the whole transaction, used by broker-level
 * reporting. A dual transaction has a listing side and a buyer side, so its
 * total sales-side and volume credit is two times its sale price.
 */
export function getTotalSideMultiplier(tx: TransactionLike): number {
  return isDual(tx) ? 2 : 1;
}

/**
 * Returns one participating agent's representation-side production credit.
 * Explicit Co-Listing, Co-Buyer, and Both Sides roles allocate only the sides
 * represented by each participant. Ambiguous legacy "other" records retain
 * their historical credit treatment until staff classifies their role.
 */
export function getAgentProductionCredit(tx: TransactionLike, agentId: string): ProductionCredit {
  const totalSides = getTotalSideMultiplier(tx);
  const primaryId = String(tx.agentId || '').trim();
  const coAgent = tx.coAgent && typeof tx.coAgent === 'object' ? tx.coAgent : {};
  const coAgentId = String(coAgent.agentId || tx.coAgentId || '').trim();
  const hasCoAgent = Boolean(tx.hasCoAgent && coAgentId);
  const isCoAgent = hasCoAgent && agentId === coAgentId;
  const isPrimary = agentId === primaryId;

  if (!hasCoAgent || (!isPrimary && !isCoAgent)) {
    return {
      closedSides: totalSides,
      pendingSides: totalSides,
      volumeMultiplier: totalSides,
      usesExplicitSideRole: false,
    };
  }

  const coPercent = num(tx.coAgentSplitPercent ?? coAgent.splitPercent, 50);
  const primaryPercent = num(tx.primaryAgentSplitPercent ?? coAgent.primarySplitPercent, 100 - coPercent);
  const coShare = Math.max(0, Math.min(1, coPercent / 100));
  const primaryShare = Math.max(0, Math.min(1, primaryPercent / 100));
  const role = normalizeRole(tx.coAgentRole ?? coAgent.role);
  const explicitSideRole = role === 'co_list' || role === 'co_buyer' || role === 'co_both';

  if (!explicitSideRole) {
    // Preserve ambiguous legacy co-agent reporting until staff identifies the side.
    const share = isCoAgent ? coShare : primaryShare;
    return {
      closedSides: isCoAgent ? share * totalSides : 1,
      pendingSides: share * totalSides,
      volumeMultiplier: share,
      usesExplicitSideRole: false,
    };
  }

  if (totalSides === 1) {
    const share = isCoAgent ? coShare : primaryShare;
    return { closedSides: share, pendingSides: share, volumeMultiplier: share, usesExplicitSideRole: true };
  }

  if (role === 'co_both') {
    const share = isCoAgent ? coShare : primaryShare;
    const credit = share * 2;
    return { closedSides: credit, pendingSides: credit, volumeMultiplier: credit, usesExplicitSideRole: true };
  }

  // A Co-Listing or Co-Buyer role splits one side. The primary agent owns the
  // full opposite side; the co-agent receives only their agreed share of the
  // represented side.
  if (isCoAgent) {
    return { closedSides: coShare, pendingSides: coShare, volumeMultiplier: coShare, usesExplicitSideRole: true };
  }
  const primaryCredit = 1 + primaryShare;
  return { closedSides: primaryCredit, pendingSides: primaryCredit, volumeMultiplier: primaryCredit, usesExplicitSideRole: true };
}
