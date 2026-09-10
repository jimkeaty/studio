import type { Firestore } from 'firebase-admin/firestore';
import { getAnniversaryCycle, isInCycle } from '@/lib/agents/anniversaryCycle';
import { isPassThroughTransaction } from '@/lib/transactions/isPassThroughTransaction';

type TransactionRecord = Record<string, any>;

export type TierProgressionAsOfResult = {
  gci: number;
  companyDollar: number;
  cycleStart: string;
  cycleEnd: string;
  includedTransactionIds: string[];
};

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asUtcDate(value: unknown): Date | null {
  if (!value) return null;
  let parsed: Date | null = null;
  if (typeof (value as any)?.toDate === 'function') parsed = (value as any).toDate();
  else if (value instanceof Date) parsed = value;
  else if (typeof value === 'string' || typeof value === 'number') parsed = new Date(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

function transactionDate(transaction: TransactionRecord): Date | null {
  return asUtcDate(transaction.closedDate) ?? asUtcDate(transaction.contractDate);
}

function transactionContribution(
  transaction: TransactionRecord,
  agentId: string,
): { gci: number; companyDollar: number } | null {
  if (String(transaction.status || '').toLowerCase() !== 'closed') return null;
  if (isPassThroughTransaction(transaction)) return null;

  if (String(transaction.agentId || '') === agentId) {
    return {
      gci: asNumber(transaction.splitSnapshot?.grossCommission ?? transaction.commission ?? transaction.gci),
      companyDollar: asNumber(transaction.splitSnapshot?.companyRetained ?? transaction.brokerGci),
    };
  }

  if (transaction.hasCoAgent && String(transaction.coAgent?.agentId || '') === agentId) {
    return {
      gci: asNumber(transaction.coAgent?.splitSnapshot?.grossCommission),
      companyDollar: asNumber(transaction.coAgent?.splitSnapshot?.companyRetained),
    };
  }

  if (String(transaction.creditSnapshot?.progressionLeaderAgentId || '') === agentId) {
    return {
      gci: asNumber(
        transaction.creditSnapshot?.progressionGciCredit ??
        transaction.splitSnapshot?.grossCommission ??
        transaction.commission ??
        transaction.gci,
      ),
      companyDollar: asNumber(
        transaction.creditSnapshot?.progressionCompanyDollarCredit ??
        transaction.splitSnapshot?.companyRetained ??
        transaction.brokerGci,
      ),
    };
  }

  return null;
}

export function calculateTierProgressionAsOf(input: {
  transactions: Array<{ id: string; data: TransactionRecord }>;
  agentId: string;
  anniversaryMonth?: number | null;
  anniversaryDay?: number | null;
  asOfDate: string | Date;
  excludeTransactionId?: string | null;
}): TierProgressionAsOfResult {
  const parsedAsOf = asUtcDate(input.asOfDate) ?? asUtcDate(new Date())!;
  const cycle = getAnniversaryCycle(
    input.anniversaryMonth,
    input.anniversaryDay,
    parsedAsOf,
  );
  let gci = 0;
  let companyDollar = 0;
  const includedTransactionIds: string[] = [];
  const seen = new Set<string>();

  for (const record of input.transactions) {
    if (!record.id || seen.has(record.id)) continue;
    seen.add(record.id);
    if (input.excludeTransactionId && record.id === input.excludeTransactionId) continue;

    const txDate = transactionDate(record.data);
    if (!txDate || txDate.getTime() > parsedAsOf.getTime() || !isInCycle(txDate, cycle)) continue;

    const contribution = transactionContribution(record.data, input.agentId);
    if (!contribution) continue;
    gci += contribution.gci;
    companyDollar += contribution.companyDollar;
    includedTransactionIds.push(record.id);
  }

  return {
    gci: Number(gci.toFixed(2)),
    companyDollar: Number(companyDollar.toFixed(2)),
    cycleStart: cycle.cycleStart.toISOString().slice(0, 10),
    cycleEnd: cycle.cycleEnd.toISOString().slice(0, 10),
    includedTransactionIds,
  };
}

export async function getTierProgressionAsOf(input: {
  db: Firestore;
  agentId: string;
  anniversaryMonth?: number | null;
  anniversaryDay?: number | null;
  asOfDate: string | Date;
  excludeTransactionId?: string | null;
}): Promise<TierProgressionAsOfResult> {
  const queries = await Promise.all([
    input.db.collection('transactions').where('agentId', '==', input.agentId).get(),
    input.db.collection('transactions').where('coAgent.agentId', '==', input.agentId).get(),
    input.db.collection('transactions').where('creditSnapshot.progressionLeaderAgentId', '==', input.agentId).get(),
  ]);

  const transactions = queries.flatMap((snapshot) =>
    snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as TransactionRecord })),
  );

  return calculateTierProgressionAsOf({
    transactions,
    agentId: input.agentId,
    anniversaryMonth: input.anniversaryMonth,
    anniversaryDay: input.anniversaryDay,
    asOfDate: input.asOfDate,
    excludeTransactionId: input.excludeTransactionId,
  });
}
