export const BROKER_ESCALATION_TERMS = [
  'termination', 'terminate', 'release', 'breach', 'default', 'lawsuit', 'sue',
  'legal', 'attorney', 'liability', 'liable', 'risk', 'ethics complaint',
  'commission dispute', 'unusual clause', 'interpret this clause', 'fair housing',
  'discrimination', 'agency dispute', 'contract interpretation',
];

export function escalationReasonForQuestion(question: string): string | null {
  const normalized = question.toLowerCase();
  const term = BROKER_ESCALATION_TERMS.find((candidate) => normalized.includes(candidate));
  return term ? `Broker judgment required: the question includes “${term}”.` : null;
}

export function keywordScore(question: string, document: Record<string, any>): number {
  const words = question.toLowerCase().match(/[a-z]{4,}/g) || [];
  const searchable = [document.title, document.summary, document.content, document.tags, document.jurisdiction, document.formVersion]
    .filter(Boolean).join(' ').toLowerCase();
  return words.reduce((score, word) => score + (searchable.includes(word) ? 1 : 0), 0);
}

export function buildTransactionContext(transaction: Record<string, any> | null): Record<string, string> | null {
  if (!transaction) return null;
  return {
    property: String(transaction.address || transaction.propertyAddress || 'Not provided'),
    status: String(transaction.status || 'Not provided'),
    representationSide: String(transaction.closingType || transaction.transactionType || 'Not provided'),
    contractDate: String(transaction.contractDate || 'Not provided'),
    projectedClose: String(transaction.projectedCloseDate || transaction.closedDate || 'Not provided'),
    otherBrokerage: String(transaction.otherBrokerage || transaction.otherAgentBrokerage || 'Not provided'),
  };
}
