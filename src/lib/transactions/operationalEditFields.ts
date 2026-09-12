/**
 * Fields that every authorized operational editor may correct on the canonical
 * transaction document. This list deliberately mirrors the unified transaction
 * form plus legacy aliases that are still present in existing records.
 *
 * Agents remain governed by the narrower agent route and its post-close guard.
 * Staff, TC, and Admin routes use this additive list alongside their existing
 * route-specific fields so a valid operational correction is never dropped.
 */
export const OPERATIONAL_TRANSACTION_FORM_FIELDS = [
  'agentId', 'agentDisplayName', 'propertyAddress', 'transactionType', 'commission', 'tcWorking', 'workingWithTc',
  'splitSnapshot', 'brokerProfit', 'commissionOverridden', 'commissionOverriddenBy', 'commissionOverriddenAt',
  'manualGciOverride', 'manualGciOverriddenBy', 'manualGciOverriddenAt',
  'manualCommissionPercentOverride', 'manualCommissionPercentOverriddenBy', 'manualCommissionPercentOverriddenAt',
  'participantAllocations', 'primaryAgentSideCredit', 'primaryAgentUnitCredit',
  'agentBonusPassThrough', 'isPassThrough', 'isInHouse', 'inHouse', 'inHouseTransaction',
  'actualCloseDate', 'closingDate', 'closedDate',
  'commercialForSale', 'commercialSalePrice', 'commercialForLease', 'commercialLeaseMonthly',
  'commercialLeasePricePerSqft', 'commercialLeaseTerm', 'commercialTotalLeaseValue',
  'commercialLeaseGci', 'commercialLeaseCommissionMode', 'commercialLeaseCommissionPct',
  'commercialLeaseCommissionFlat', 'commercialLeaseEffectivePct', 'isCommercial',
  'appraisalConditioned', 'appraisalPeriodDays', 'depositDueDays', 'depositDeadline',
  'financingCommitmentDays', 'dueDiligenceDays', 'titleCurativeDays', 'closingDays',
  'buyerCommissionPct', 'sellerCommissionPct',
  'loanOfficeNumber', 'loanOfficerStreet', 'titleOfficerStreet',
  'mediaRequested',
  'signInstallDate', 'signRider', 'signNotes',
  'showingLeadTime', 'showingLockboxCode', 'showingAlarmCode',
  'showingCallOrder1Name', 'showingCallOrder1Phone', 'showingCallOrder1Mobile',
  'showingCallOrder1AltPhone', 'showingCallOrder1Email', 'showingCallOrder1Type',
  'showingCallOrder1Confirm', 'showingCallOrder1Notify',
  'showingCallOrder2Phone', 'showingCallOrder3Phone',
  'occupancyDate', 'occupancyNotes',
  'additionalNotes',
  'isCoListing', 'coListingAgentName', 'coListingAgentBrokerage', 'coListingAgentEmail',
  'coListingAgentPhone', 'coListingAgentSplit', 'coAgent',
  'outboundReferral', 'outboundReferralEmail', 'outboundReferralPhone',
  'inboundReferral', 'inboundReferralBrokerage', 'inboundReferralEmail', 'inboundReferralPhone',
  'buyerWarrantyEducationRequested', 'sellerWarrantyEducationRequested',
  'inspectionRowData',
  'stagingConsultRequested', 'stagingServiceType', 'stagingConsultationDate',
  'stagingConsultationTime', 'stagingStagerName', 'stagingStagerEmail',
  'stagingStagerPhone', 'stagingNotes', 'stagingTcSchedule',
] as const;

export const DIRECT_SPLIT_FIELDS = new Set([
  'agentPct',
  'agentDollar',
  'brokerPct',
  'brokerGci',
]);

/**
 * Keep canonical close-date aliases and reporting year aligned for edits made
 * through queue detail screens as well as the unified transaction form.
 */
export function synchronizeOperationalCloseDate(updates: Record<string, any>) {
  const closeDateField = ['closedDate', 'closingDate', 'actualCloseDate']
    .find((field) => Object.prototype.hasOwnProperty.call(updates, field));
  if (!closeDateField) return;

  const closeDate = updates[closeDateField] || null;
  updates.closedDate = closeDate;
  updates.closingDate = closeDate;
  updates.actualCloseDate = closeDate;

  if (!closeDate) return;
  const date = new Date(closeDate);
  if (!Number.isNaN(date.getTime())) updates.year = date.getFullYear();
}

/**
 * Apply authorized manual split values to the current or freshly recalculated
 * snapshot. Gross commission remains governed by the normal commission rules;
 * this only prevents a manually entered agent/broker split from being replaced
 * by a profile-derived split during the same save.
 */
export function mergeOperationalDirectSplit(
  currentTransaction: Record<string, any>,
  updates: Record<string, any>,
): boolean {
  const changed = [...DIRECT_SPLIT_FIELDS].some((field) => Object.prototype.hasOwnProperty.call(updates, field));
  if (!changed) return false;

  const baseSplit = updates.splitSnapshot || currentTransaction.splitSnapshot || {};
  const agentPct = updates.agentPct != null ? Number(updates.agentPct) : null;
  const agentDollar = updates.agentDollar != null ? Number(updates.agentDollar) : null;
  const brokerPct = updates.brokerPct != null ? Number(updates.brokerPct) : null;
  const brokerGci = updates.brokerGci != null ? Number(updates.brokerGci) : null;
  const merged = { ...currentTransaction, ...updates };
  const feeAmount = Number(merged.txComplianceFeeAmount) || 0;
  const feePaidBy = String(merged.txComplianceFeePaidBy || '').toLowerCase().trim();
  const agentPaysFee = merged.txComplianceFee === 'yes' && feeAmount > 0 && feePaidBy === 'agent';
  const netAgentDollar = agentDollar !== null && agentPaysFee
    ? Number(Math.max(0, agentDollar - feeAmount).toFixed(2))
    : agentDollar;

  updates.splitSnapshot = {
    ...baseSplit,
    ...(agentPct !== null && Number.isFinite(agentPct) ? { agentSplitPercent: agentPct } : {}),
    ...(netAgentDollar !== null && Number.isFinite(netAgentDollar) ? { agentNetCommission: netAgentDollar } : {}),
    ...(brokerPct !== null && Number.isFinite(brokerPct) ? { companySplitPercent: brokerPct } : {}),
    ...(brokerGci !== null && Number.isFinite(brokerGci) ? { companyRetained: brokerGci } : {}),
    ...(agentPaysFee && netAgentDollar !== null ? { agentFeeDeduction: feeAmount } : {}),
  };
  return true;
}
