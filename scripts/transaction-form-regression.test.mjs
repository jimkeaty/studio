import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const formSource = readFileSync(resolve(root, 'src/app/dashboard/transactions/new/page.tsx'), 'utf8');
const agentRouteSource = readFileSync(resolve(root, 'src/app/api/agent/transactions/[txId]/route.ts'), 'utf8');
const adminRouteSource = readFileSync(resolve(root, 'src/app/api/admin/transactions/route.ts'), 'utf8');
const brokerFeeSettingsSource = readFileSync(resolve(root, 'src/app/api/admin/transaction-fee-settings/route.ts'), 'utf8');
const createTransactionSource = readFileSync(resolve(root, 'src/app/api/tc/route.ts'), 'utf8');
const commercialParserSource = readFileSync(resolve(root, 'src/app/api/agent/parse-commercial-agreement/route.ts'), 'utf8');
const inspectionRequestSource = readFileSync(resolve(root, 'src/app/api/agent/inspection-request/route.ts'), 'utf8');
const inspectionConfirmSource = readFileSync(resolve(root, 'src/app/api/agent/inspection-request/confirm/route.ts'), 'utf8');
const inspectionSchedulingPageSource = readFileSync(resolve(root, 'src/app/inspect/[token]/page.tsx'), 'utf8');
const transactionSectionsSource = readFileSync(resolve(root, 'src/components/transactions/TransactionFormSections.tsx'), 'utf8');
const transactionReminderSource = readFileSync(resolve(root, 'src/app/api/cron/transaction-reminders/route.ts'), 'utf8');
const contactsRouteSource = readFileSync(resolve(root, 'src/app/api/contacts/route.ts'), 'utf8');
const tcApprovalSource = readFileSync(resolve(root, 'src/app/api/admin/tc/[id]/route.ts'), 'utf8');
const trainingArticlesSource = readFileSync(resolve(root, 'src/lib/training/articles.ts'), 'utf8');
const aphwInvitationSource = readFileSync(resolve(root, 'src/lib/home-warranty/sendAphwEducationInvite.ts'), 'utf8');
const agentRollupSource = readFileSync(resolve(root, 'src/lib/rollups/rebuildAgentRollup.ts'), 'utf8');
const leaderboardRouteSource = readFileSync(resolve(root, 'src/app/api/rollups/leaderboard/route.ts'), 'utf8');
const agentDashboardSource = readFileSync(resolve(root, 'src/app/api/dashboard/route.ts'), 'utf8');
const brokerCommandMetricsSource = readFileSync(resolve(root, 'src/app/api/broker/command-metrics/route.ts'), 'utf8');
const passThroughHelperSource = readFileSync(resolve(root, 'src/lib/transactions/isPassThroughTransaction.ts'), 'utf8');
const historicalRollupRouteSource = readFileSync(resolve(root, 'src/app/api/cron/rebuild-historical-rollups/route.ts'), 'utf8');
const productionCreditSource = readFileSync(resolve(root, 'src/lib/transactions/resolveProductionCredit.ts'), 'utf8');
const bonusHelperSource = readFileSync(resolve(root, 'src/lib/transactions/resolveAgentBonusPassThrough.ts'), 'utf8');
const coAgentAllocationSource = readFileSync(resolve(root, 'src/lib/transactions/syncCoAgentAllocations.ts'), 'utf8');

test('new buyer transactions default to the editable $395 compliance fee', () => {
  assert.match(formSource, /txComplianceFee: initialClosingType === 'buyer' \? 'yes' : ''/);
  assert.match(formSource, /txComplianceFeeAmount: initialClosingType === 'buyer' \? 395 : ''/);
  assert.match(formSource, /if \(editMode \|\| watchedClosingType !== 'buyer'\) return/);
  assert.match(formSource, /form\.setValue\('txComplianceFeeAmount', 395 as any\)/);
});

test('APHW education requests retain buyer and seller distinctions, consent, alerts, and in-form help', () => {
  assert.match(formSource, /buyerWarrantyEducationRequested: z\.enum\(\['yes', 'no'\]\)\.optional\(\)/);
  assert.match(formSource, /sellerWarrantyEducationRequested: z\.enum\(\['yes', 'no'\]\)\.optional\(\)/);
  assert.match(formSource, /Buyer Home Warranty Education/);
  assert.match(formSource, /Seller Home Warranty Education/);
  assert.match(formSource, /\$5,000 in E&amp;O deductible coverage/);
  assert.match(formSource, /\$2,500 in post-legal coverage/);
  assert.match(formSource, /permission to share the buyer&apos;s contact information/);
  assert.match(transactionSectionsSource, /buyerWarrantyEducationRequested/);
  assert.match(transactionSectionsSource, /sellerWarrantyEducationRequested/);
  assert.match(transactionSectionsSource, /<Info className=/);
  assert.match(createTransactionSource, /buyerWarrantyEducationRequested: toStr\(body\.buyerWarrantyEducationRequested\)/);
  assert.match(createTransactionSource, /Home Warranty Education Request/);
  assert.match(createTransactionSource, /sendAphwEducationInvitations/);
  assert.match(agentRouteSource, /'buyerWarrantyEducationRequested', 'sellerWarrantyEducationRequested'/);
  assert.match(agentRouteSource, /Home Warranty Education Request Received/);
  assert.match(agentRouteSource, /sendAphwEducationInvitations/);
  assert.match(adminRouteSource, /'buyerWarrantyEducationRequested', 'sellerWarrantyEducationRequested'/);
  assert.match(adminRouteSource, /sendAphwEducationInvitations/);
  assert.match(trainingArticlesSource, /home-warranty-education-calls/);
  assert.match(trainingArticlesSource, /12-month nurture experience/);
  assert.match(trainingArticlesSource, /consultation calendar link/);
  assert.match(aphwInvitationSource, /https:\/\/www\.aphw\.com\/consultation\//);
  assert.match(aphwInvitationSource, /Your Home Warranty Education Call/);
  assert.match(aphwInvitationSource, /Your Seller Home Warranty Coverage/);
});

test('reopened shared transaction forms hydrate and submit their document list', () => {
  assert.match(formSource, /const hydratedDocs = \(Array\.isArray\(tx\.documents\) \? tx\.documents : \[\]\)/);
  assert.match(formSource, /setUploadedDocs\(Array\.from\(new Map\(hydratedDocs\.map/);
  assert.match(formSource, /documents: uploadedDocs,\s*\/\/ The hydrated document list is authoritative[\s\S]*?_replaceDocuments: true/);
  assert.match(agentRouteSource, /When _replaceDocuments=true \(delete\/archive\), use the provided array as-is/);
  assert.match(adminRouteSource, /'documents'/);
});

test('listing lifecycle dates remain visible and hydrate after a listing becomes Pending', () => {
  assert.match(formSource, /listingDate: tx\.listingDate \|\| tx\.listDate \|\| ''/);
  assert.match(formSource, /listingExpirationDate: tx\.listingExpirationDate \|\| tx\.expirationDate \|\| tx\.listingExpiration \|\| ''/);
  assert.match(formSource, /const isListingSideTransaction = watchedClosingType === 'listing' \|\| watchedClosingType === 'dual'/);
  assert.match(formSource, /\{isListingSideTransaction && \(/);
});

test('an explicit No clears a transaction fee and cannot be re-enabled by stale fee values', () => {
  assert.match(formSource, /const feeExplicitlyDisabled = \['no', 'false', 'off', '0'\]\.includes\(rawComplianceFee\)/);
  assert.match(formSource, /if \(value === 'no'\) \{[\s\S]*form\.setValue\('txComplianceFeeAmount', ''\)/);
  assert.match(adminRouteSource, /updates\.txComplianceFee = 'no';[\s\S]*updates\.txComplianceFeeAmount = 0/);
  assert.match(agentRouteSource, /updates\.txComplianceFee = 'no';[\s\S]*updates\.txComplianceFeeAmount = 0/);
});

test('broker configuration exposes separate buyer and listing defaults', () => {
  assert.match(brokerFeeSettingsSource, /const FALLBACKS = \{ buyerDefault: 395, listingDefault: 150 \}/);
  assert.match(formSource, /watchedClosingType === 'listing' \|\| watchedClosingType === 'dual'/);
  assert.match(formSource, /defaults\.listingDefault/);
  assert.match(formSource, /defaults\.buyerDefault/);
});

test('legacy listing fees hydrate into visible editable fee controls and clear canonically', () => {
  assert.match(formSource, /const resolvedLegacyListingFee = Number\(tx\.transactionFee \?\? 0\) \|\| 0/);
  assert.match(formSource, /resolvedLegacyListingFee > 0/);
  assert.match(formSource, /transactionFee: resolvedComplianceFee === 'yes'/);
  assert.match(formSource, /watchedClosingType !== 'referral' && <Section title="Additional Info">/);
  assert.match(formSource, /form\.setValue\('transactionFee', ''\)/);
  assert.match(adminRouteSource, /updates\.transactionFee = 0/);
  assert.match(agentRouteSource, /updates\.transactionFee = 0/);
});

test('legacy finalized commission aliases hydrate the earnings breakdown GCI', () => {
  assert.match(formSource, /const explicitGci = tx\.gci \|\| tx\.splitSnapshot\?\.grossCommission \|\| tx\.splitSnapshot\?\.grossCommissionAmount \|\| tx\.grossCommission \|\| tx\.commission \|\| tx\.commissionAmount \|\| tx\.grossCommissionIncome \|\| ''/);
  assert.match(formSource, /const resolvedAgentDollar = tx\.agentDollar \|\| tx\.splitSnapshot\?\.agentNetCommission \|\| tx\.splitSnapshot\?\.agentDollar \|\| tx\.agentNetCommission \|\| tx\.agentCommission \|\| ''/);
  assert.match(formSource, /gci: resolvedGci/);
  assert.match(formSource, /agentDollar: resolvedAgentDollar/);
});

test('a legacy zero GCI is recalculated from saved commission base and rate before split-dollar inference', () => {
  assert.match(formSource, /const resolvedCommissionBasePrice = tx\.commissionBasePrice \|\| resolvedSalePrice \|\| ''/);
  assert.match(formSource, /const calculatedLegacyGci = !isPassThroughTransaction && Number\(explicitGci\) <= 0 && Number\(resolvedCommissionBasePrice\) > 0 && Number\(resolvedCommissionPercent\) > 0/);
  assert.match(formSource, /resolveGCI\(\{ commissionBasePrice: Number\(resolvedCommissionBasePrice\), commissionPercent: Number\(resolvedCommissionPercent\) \}\)/);
  assert.match(formSource, /const inferredLegacyGci = !isPassThroughTransaction && Number\(explicitGci\) <= 0 && calculatedLegacyGci <= 0/);
  assert.match(formSource, /const resolvedGci = Number\(explicitGci\) > 0 \? explicitGci : \(calculatedLegacyGci \|\| inferredLegacyGci \|\| ''\)/);
});

test('pass-throughs receive sale and volume recognition but no income, company-dollar, or tier credit', () => {
  assert.match(passThroughHelperSource, /normalizeDealSource\(String\(tx\.dealSource \?\? ''\)\) === 'pass_through'/);
  assert.match(agentRollupSource, /closedVolume \+= volumeCredit;[\s\S]*?if \(!isPassThrough\) \{[\s\S]*?totalGCI \+=/);
  assert.match(agentRollupSource, /if \(!isPassThrough\) \{[\s\S]*?tierProgressionGci \+=/);
  assert.match(leaderboardRouteSource, /const isPassThrough = isPassThroughTransaction\(t\);/);
  assert.match(leaderboardRouteSource, /agg\.closedVolume \+=[\s\S]*?if \(!isPassThrough\) \{[\s\S]*?agg\.agentNetCommission/);
  assert.match(agentDashboardSource, /const isPassThrough = isPassThroughTransaction\(t\);/);
  assert.match(agentDashboardSource, /closedUnits \+= sideCount;[\s\S]*?closedVolume \+= productionVolume;[\s\S]*?if \(!isPassThrough\) totalGCI \+= gci/);
  assert.match(agentDashboardSource, /if \(isPassThroughTransaction\(t\)\) continue;[\s\S]*?grossGCIYTD \+= tierGCI/);
  assert.match(brokerCommandMetricsSource, /const isPassThrough = isPassThroughTransaction\(t\);/);
  assert.match(formSource, /counts as a closed sale and sale-price volume,[\s\S]*?does not count toward agent GCI, agent net, brokerage\/company dollar, or tier advancement/);
});

test('agent bonus pass-through is separate from commission, splits evenly for co-agents, and is excluded from production and tier calculations', () => {
  assert.match(formSource, /agentBonusPassThrough: z\.coerce\.number\(\)\.min\(0\)/);
  assert.match(formSource, /Agent Bonus Pass-Through/);
  assert.match(formSource, /Total Agent Payout/);
  assert.match(formSource, /agentBonusPassThrough: tx\.agentBonusPassThrough \?\? ''/);
  assert.match(transactionSectionsSource, /Agent Bonus Pass-Through/);
  assert.match(createTransactionSource, /agentBonusPassThrough: toNum\(body\.agentBonusPassThrough\)/);
  assert.match(agentRouteSource, /'agentBonusPassThrough'/);
  assert.match(adminRouteSource, /'buyerWarrantyEducationRequested', 'sellerWarrantyEducationRequested', 'agentBonusPassThrough'/);
  assert.match(bonusHelperSource, /getAgentBonusPassThrough/);
  assert.match(bonusHelperSource, /const coAgentShare = money\(totalBonus \/ 2\)/);
  assert.match(coAgentAllocationSource, /agentBonusPassThrough: primaryAgentBonus/);
  assert.match(coAgentAllocationSource, /agentBonusPassThrough: coAgentBonus/);
  assert.match(agentRollupSource, /agentBonusPassThrough \+= getAgentBonusPassThrough\(t, agentId\)/);
  assert.match(agentRollupSource, /totalAgentPayout: num\(agentNetCommission \+ agentBonusPassThrough\)/);
  assert.match(agentDashboardSource, /agentBonusPassThrough \+= bonusForAgent/);
  assert.match(agentDashboardSource, /netEarned \+= agentBonusPassThrough/);
  assert.doesNotMatch(agentRollupSource, /totalGCI \+= getAgentBonusPassThrough/);
  assert.doesNotMatch(agentRollupSource, /tierProgressionGci \+= getAgentBonusPassThrough/);
});

test('historical rollup rebuild is a secured, confirmed maintenance action that rebuilds every ledger year', () => {
  assert.match(historicalRollupRouteSource, /const CRON_SECRET = process\.env\.CRON_SECRET \|\| ''/);
  assert.match(historicalRollupRouteSource, /const CONFIRMATION = 'rebuild_all_historical_rollups'/);
  assert.match(historicalRollupRouteSource, /secret !== CRON_SECRET/);
  assert.match(historicalRollupRouteSource, /body\?\.confirm !== CONFIRMATION/);
  assert.match(historicalRollupRouteSource, /transactionYear\(doc\.data\(\) as Record<string, unknown>\)/);
  assert.match(historicalRollupRouteSource, /for \(const year of years\) \{[\s\S]*?rebuildAllRollupsForYear\(adminDb, year\)/);
  assert.match(historicalRollupRouteSource, /systemMaintenance'\)\.doc\('historicalRollupRebuild'/);
});

test('dual and co-agent production credit follows explicitly assigned representation sides', () => {
  assert.match(productionCreditSource, /export function getTotalSideMultiplier[\s\S]*?return isDual\(tx\) \? 2 : 1/);
  assert.match(productionCreditSource, /role === 'co_list' \|\| role === 'co_buyer' \|\| role === 'co_both'/);
  assert.match(productionCreditSource, /if \(role === 'co_both'\)[\s\S]*?const credit = share \* 2/);
  assert.match(productionCreditSource, /const primaryCredit = 1 \+ primaryShare/);
  assert.match(formSource, /coAgentRole: z\.enum\(\['co_list', 'co_buyer', 'co_both', 'referral', 'other'\]\)/);
  assert.match(formSource, /<SelectItem value="co_both">Co-Agent on Both Sides<\/SelectItem>/);
  assert.match(agentRollupSource, /getAgentProductionCredit\(t, agentId\)/);
  assert.match(leaderboardRouteSource, /getAgentProductionCredit\(t, participantId\)/);
  assert.match(agentDashboardSource, /const productionCredit = getAgentProductionCredit\(t, reportingAgentId\)/);
  assert.match(agentDashboardSource, /const productionVolume = dealValue \* productionCredit\.volumeMultiplier/);
  assert.match(brokerCommandMetricsSource, /const productionVolume = dealValue \* getTotalSideMultiplier\(t as Record<string, any>\)/);
});
test('operational staff can override closed-file GCI while agents remain read-only', () => {
  assert.match(formSource, /const isClosedAgentView = editMode && persistedEditStatus === 'closed' && !hasOperationalEditAuthority/);
  assert.match(formSource, /\{hasOperationalEditAuthority && \(/);
  assert.match(formSource, /gciManuallyEdited\.current = true/);
  assert.match(formSource, /if \(gciManuallyEdited\.current\) return/);
  assert.match(formSource, /if \(!hasOperationalEditAuthority\) return/);
  assert.match(adminRouteSource, /'gci'/);
  assert.match(adminRouteSource, /'brokerPct'/);
  assert.match(adminRouteSource, /'agentPct'/);
  assert.match(adminRouteSource, /'brokerGci'/);
  assert.match(adminRouteSource, /'agentDollar'/);
});

test('manual broker or agent dollar overrides clear split percentages and persist as overrides', () => {
  assert.match(formSource, /const setManualDollarSplit = \(field: 'brokerGci' \| 'agentDollar', value: unknown\) => \{/);
  assert.match(formSource, /form\.setValue\('brokerPct', '' as any, \{ shouldDirty: true, shouldValidate: true \}\)/);
  assert.match(formSource, /form\.setValue\('agentPct', '' as any, \{ shouldDirty: true, shouldValidate: true \}\)/);
  assert.match(formSource, /setManualDollarSplit\('brokerGci', val\)/);
  assert.match(formSource, /setManualDollarSplit\('agentDollar', val\)/);
  assert.match(formSource, /commissionManualOverride\.current \? \{[\s\S]*commissionOverridden: true/);
  assert.match(adminRouteSource, /body\.agentPct !== undefined \? \{ agentSplitPercent: Number\(body\.agentPct\) \} : \{\}/);
  assert.match(adminRouteSource, /body\.brokerPct !== undefined \? \{ companySplitPercent: Number\(body\.brokerPct\) \} : \{\}/);
});

test('manual GCI and gross commission rate overrides survive save and reopen independently of dollar splits', () => {
  assert.match(formSource, /gciManuallyEdited\.current = Boolean\(tx\.manualGciOverride \|\| editCommissionOverride\.current\)/);
  assert.match(formSource, /commPctManuallyEdited\.current = Boolean\(tx\.manualCommissionPercentOverride \|\| editCommissionOverride\.current\)/);
  assert.match(formSource, /manualGciOverride: true/);
  assert.match(formSource, /manualCommissionPercentOverride: true/);
  assert.match(formSource, /Manual GCI override — saved as entered until staff changes it/);
  assert.match(formSource, /Manual rate override — saved as entered until staff changes it/);
  assert.match(adminRouteSource, /'manualGciOverride', 'manualGciOverriddenBy', 'manualGciOverriddenAt'/);
  assert.match(adminRouteSource, /'manualCommissionPercentOverride', 'manualCommissionPercentOverriddenBy', 'manualCommissionPercentOverriddenAt'/);
  assert.match(createTransactionSource, /manualGciOverride: toBool\(body\.manualGciOverride\)/);
  assert.match(createTransactionSource, /manualCommissionPercentOverride: toBool\(body\.manualCommissionPercentOverride\)/);
  assert.match(agentRouteSource, /const manualGciOverride = updates\.manualGciOverride === true \|\| txData\.manualGciOverride === true/);
});

test('a newly edited manual percentage split must include both values and total 100%', () => {
  assert.match(formSource, /const manualPercentageSplitEdited = useRef\(false\)/);
  assert.match(formSource, /manualPercentageSplitEdited\.current = true/);
  assert.match(formSource, /Math\.abs\(\(brokerPct \+ agentPct\) - 100\) > 0\.01/);
  assert.match(formSource, /validateManualPercentageSplit: true/);
  assert.match(adminRouteSource, /body\.validateManualPercentageSplit === true/);
  assert.match(adminRouteSource, /Broker % and Agent % must both be provided and total 100%/);
});

test('referrals keep address optional while persisting optional contacts, key dates, and referral fee details', () => {
  assert.match(formSource, /address: z\.string\(\)\.optional\(\)\.or\(z\.literal\(''\)\)/);
  assert.match(formSource, /data\.closingType === 'referral' \|\| String\(data\.address \|\| ''\)\.trim\(\)\.length >= 5/);
  assert.match(formSource, /outboundReferralEmail: z\.string\(\)\.email\(\)\.optional\(\)\.or\(z\.literal\(''\)\)/);
  assert.match(formSource, /Referral Key Dates/);
  assert.match(formSource, /Expected Gross Commission/);
  assert.match(createTransactionSource, /if \(!address && closingType !== 'referral'\) return jsonError\(400, 'address is required'\)/);
  assert.match(createTransactionSource, /outboundReferralEmail: toStr\(body\.outboundReferralEmail\) \|\| null/);
  assert.match(createTransactionSource, /outboundReferralPhone: toStr\(body\.outboundReferralPhone\) \|\| null/);
  assert.match(agentRouteSource, /'outboundReferralFeePercent', 'outboundReferralFeeDollar'/);
  assert.match(agentRouteSource, /'outboundReferralEmail', 'outboundReferralPhone'/);
  assert.match(adminRouteSource, /'outboundReferralFee', 'outboundReferralFeePercent', 'outboundReferralFeeDollar'/);
});

test('commercial agreement extraction preserves the selected side and never turns opposing contract agents into dual agency or internal co-agents', () => {
  assert.match(commercialParserSource, /Always return closingType: "" and clientType: ""/);
  assert.match(commercialParserSource, /Do NOT infer dual agency from the commission clause/);
  assert.match(commercialParserSource, /Do NOT create, infer, or populate an internal co-agent/);
  assert.match(formSource, /const rawSelectedSide = form\.getValues\('closingType'\)/);
  assert.match(formSource, /const selectedClientType = selectedSide === 'listing' \? 'seller' : selectedSide === 'dual' \? 'dual' : 'buyer'/);
  assert.match(formSource, /form\.setValue\('closingType', selectedSide, \{ shouldDirty: true \}\)/);
  assert.match(formSource, /form\.setValue\('clientType', selectedClientType, \{ shouldDirty: true \}\)/);
  assert.match(formSource, /const isListingSide = selectedSide === 'listing' \|\| selectedSide === 'dual'/);
  assert.match(formSource, /setIfPresent\('otherAgentName', f\.listingAgentName\)/);
  assert.doesNotMatch(formSource, /if \(f\.closingType && \['buyer', 'listing', 'dual'\]\.includes\(f\.closingType as string\)\)[\s\S]{0,160}form\.setValue\('closingType'/);
});

test('commercial agreements capture printed appraisal, deposit, financing, and closing periods and persist them on new and edited files', () => {
  for (const term of ['appraisalConditioned', 'appraisalPeriodDays', 'depositDueDays', 'financingCommitmentDays', 'dueDiligenceDays', 'titleCurativeDays', 'closingDays']) {
    assert.match(commercialParserSource, new RegExp(`"${term}"`));
    assert.match(formSource, new RegExp(`${term}:`));
    assert.match(adminRouteSource, new RegExp(`'${term}'`));
    assert.match(agentRouteSource, new RegExp(`'${term}'`));
    assert.match(createTransactionSource, new RegExp(`${term}:`));
  }
  assert.match(formSource, /Commercial Agreement Terms/);
  assert.match(formSource, /Sale is conditioned on appraisal/);
  assert.match(formSource, /Final Loan Commitment \(days\)/);
});

test('commercial agreements calculate only unambiguous effective-date deadlines and preserve an editable deposit deadline', () => {
  assert.match(formSource, /function calculateCommercialCalendarDeadline\(effectiveDate: unknown, periodDays: unknown\): string/);
  assert.match(formSource, /const inspectionDeadline = f\.inspectionDeadline \|\| calculateCommercialCalendarDeadline\(effectiveDate, f\.dueDiligenceDays\)/);
  assert.match(formSource, /const appraisalDeadline = f\.appraisalDeadline \|\| \(f\.appraisalConditioned \? calculateCommercialCalendarDeadline\(effectiveDate, f\.appraisalPeriodDays\) : ''\)/);
  assert.match(formSource, /const financingDeadline = f\.financingCommitmentDeadline \|\| calculateCommercialCalendarDeadline\(effectiveDate, f\.financingCommitmentDays\)/);
  assert.match(formSource, /const depositDeadline = calculateCommercialCalendarDeadline\(effectiveDate, f\.depositDueDays\)/);
  assert.match(formSource, /const projectedCloseDate = f\.projectedCloseDate \|\| calculateCommercialCalendarDeadline\(inspectionDeadline, f\.closingDays\)/);
  assert.match(formSource, /name="depositDeadline"/);
  assert.match(adminRouteSource, /'depositDeadline'/);
  assert.match(agentRouteSource, /'depositDeadline'/);
  assert.match(createTransactionSource, /depositDeadline: toStr\(body\.depositDeadline\)/);
  assert.doesNotMatch(formSource, /calculateCommercialCalendarDeadline\(effectiveDate, f\.titleCurativeDays\)/,
    'Title curative time begins after a future defect notice and must not become a guessed title deadline');
});

test('commercial agreement milestones populate when a verified effective date is entered after upload without overwriting manual deadlines', () => {
  assert.match(formSource, /const watchedContractDate = form\.watch\('contractDate'\)/);
  assert.match(formSource, /Commercial agreements often reveal the printed periods before an agent[\s\S]*confirms the effective date/);
  assert.match(formSource, /if \(!String\(watchedDealType \|\| ''\)\.startsWith\('commercial'\)\) return/);
  assert.match(formSource, /const inspectionDeadline = calculateCommercialCalendarDeadline\(watchedContractDate, watchedCommercialDueDiligenceDays\)/);
  assert.match(formSource, /const appraisalDeadline = watchedCommercialAppraisalConditioned[\s\S]*watchedCommercialAppraisalPeriodDays/);
  assert.match(formSource, /const finalLoanCommitmentDeadline = calculateCommercialCalendarDeadline\(watchedContractDate, watchedCommercialFinancingDays\)/);
  assert.match(formSource, /if \(inspectionDeadline && !form\.getValues\('inspectionDeadline'\)\)/);
  assert.match(formSource, /if \(appraisalDeadline && !form\.getValues\('appraisalDeadline'\)\)/);
  assert.match(formSource, /if \(finalLoanCommitmentDeadline && !form\.getValues\('finalLoanCommitmentDeadline'\)\)/);
});

test('new files use only the initial transaction choice while edit-side corrections stay in the open form', () => {
  assert.match(formSource, /const applyRepresentationSide = \(side: TransactionSide\) => \{/);
  assert.match(formSource, /form\.setValue\('clientType', side === 'listing' \? 'seller' : side === 'dual' \? 'dual' : side === 'buyer' \? 'buyer' : ''\)/);
  assert.match(formSource, /\{editMode && \([\s\S]*Representation Side/);
  assert.doesNotMatch(formSource, /onClick=\{\(\) => setPdfStep\('type'\)\}/);
});

test('inspection requests use the supported JSON API and can deliver by vendor email or text', () => {
  assert.doesNotMatch(formSource, /\/api\/agent\/send-inspection-request/);
  assert.doesNotMatch(transactionSectionsSource, /\/api\/agent\/send-inspection-request/);
  assert.match(formSource, /\/api\/agent\/inspection-request/);
  assert.match(transactionSectionsSource, /\/api\/agent\/inspection-request/);
  assert.match(formSource, /inspectionCategory: key/);
  assert.match(transactionSectionsSource, /inspectionCategory: key/);
  assert.match(formSource, /sendMode: prev\[key\]\?\.sendMode \|\| 'selected'/);
  assert.match(inspectionRequestSource, /const sendMode = requestedSendMode === 'all' \? 'all' : 'selected'/);
  assert.match(formSource, /const responseText = await res\.text\(\);/);
  assert.match(transactionSectionsSource, /const responseText = await res\.text\(\);/);
  assert.match(inspectionRequestSource, /Selected vendor has no email address or mobile number/);
  assert.match(inspectionRequestSource, /No active vendors with an email address or mobile number found/);
  assert.match(inspectionRequestSource, /smsSent/);
  assert.match(inspectionRequestSource, /TWILIO_ACCOUNT_SID/);
});

test('inspector communications contain client contact details and confirmed-inspection links open the unified transaction form', () => {
  assert.match(inspectionRequestSource, /Client: \$\{clientName\}/);
  assert.match(inspectionRequestSource, /Phone: \$\{clientPhone\}/);
  assert.match(inspectionRequestSource, /Email: \$\{clientEmail\}/);
  assert.match(inspectionRequestSource, /Agent: \$\{agentName\}/);
  assert.match(inspectionRequestSource, /Agent Phone: \$\{agentPhone\}/);
  assert.match(inspectionRequestSource, /Agent Email: \$\{agentEmail\}/);
  assert.match(inspectionConfirmSource, /\/dashboard\/transactions\/new\?edit=\$\{request\.transactionId\}/);
  assert.doesNotMatch(inspectionConfirmSource, /\/dashboard\/transactions\/\$\{request\.transactionId\}/);
  assert.match(inspectionConfirmSource, /clientPhone: request\.clientPhone/);
  assert.match(inspectionConfirmSource, /clientEmail: request\.clientEmail/);
  assert.match(inspectionSchedulingPageSource, /label="Client Phone"/);
  assert.match(inspectionSchedulingPageSource, /label="Client Email"/);
  assert.match(inspectionSchedulingPageSource, /label="Agent Phone"/);
  assert.match(inspectionSchedulingPageSource, /label="Agent Email"/);
  assert.match(inspectionSchedulingPageSource, /href=\{`tel:\$\{data\.agentPhone\}`\}/);
  assert.match(inspectionSchedulingPageSource, /href=\{`sms:\$\{data\.agentPhone\}`\}/);
  assert.match(inspectionSchedulingPageSource, /href=\{`mailto:\$\{data\.agentEmail\}`\}/);
  assert.match(inspectionSchedulingPageSource, /Text Agent/);
});

test('inspection emails retain the branded sender while replying directly to a valid requesting-agent email', () => {
  assert.match(inspectionRequestSource, /const replyTo = typeof agentEmail === 'string'/);
  assert.match(inspectionRequestSource, /\^\\S\+@\\S\+\\\.\\S\+\$/);
  assert.match(inspectionRequestSource, /from: fromEmail/);
  assert.match(inspectionRequestSource, /\.\.\.\(replyTo \? \{ replyTo \} : \{\}\)/);
});

test('automated inspector SMS directs replies to the secure Text Agent action', () => {
  assert.match(inspectionRequestSource, /Please do not reply to this automated text/);
  assert.match(inspectionRequestSource, /use Text Agent, Call Agent, or Email Agent/);
});

test('ShowingTime information saves and reopens through the unified Staff Queue form without silently dropping current fields', () => {
  const currentShowingFields = [
    'showingNewOrChange', 'showingMaxApptLength', 'showingApptOverlaps', 'showingVirtualPreference',
    'showingNoSameDayAppts', 'showingLeadTimeRequired', 'showingLeadTimeSuggested', 'showingShareAgentInfo',
    'showingAccessType', 'showingAccessNotes', 'showingAccessDoor', 'showingDisarmCode', 'showingArmCode',
    'showingPasscode', 'showingAlarmNotes', 'showingNotesToStaff', 'showingCallOrder2AltPhone',
    'showingCallOrder2Type', 'showingCallOrder2Confirm', 'showingCallOrder2Notify', 'showingCallOrder3AltPhone',
    'showingCallOrder3Type', 'showingCallOrder3Confirm', 'showingCallOrder3Notify',
  ];
  for (const field of currentShowingFields) {
    assert.match(formSource, new RegExp(`${field}: (?:tx\\.${field}|Array\\.isArray\\(tx\\.${field}\\))`), `${field} must hydrate when a transaction reopens`);
    assert.match(adminRouteSource, new RegExp(`'${field}'`), `${field} must persist through operational Staff Queue saves`);
    assert.match(agentRouteSource, new RegExp(`'${field}'`), `${field} must persist through agent saves`);
  }
  assert.match(formSource, /showingCallOrder2Mobile: tx\.showingCallOrder2Mobile \|\| tx\.showingCallOrder2Phone/);
  assert.match(formSource, /showingCallOrder3Mobile: tx\.showingCallOrder3Mobile \|\| tx\.showingCallOrder3Phone/);
  assert.match(formSource, /showingNotesToAgent: Array\.isArray\(tx\.showingNotesToAgent\)/);
});

test('ShowingTime owner call orders reuse saved seller contacts without replacing manual call-order entries', () => {
  assert.match(formSource, /const populateShowingOwnerContact = useCallback\(\(callOrder: 2 \| 3\)/);
  assert.match(formSource, /sellerName.*sellerPhone.*sellerEmail/);
  assert.match(formSource, /seller2Name.*seller2Phone.*seller2Email/);
  assert.match(formSource, /const seller = sellerContacts\[callOrder - 2\]/);
  assert.match(formSource, /!String\(form\.getValues\(field as any\) \|\| ''\)\.trim\(\)/);
  assert.match(formSource, /if \(value === 'owner'\) populateShowingOwnerContact\(2\)/);
  assert.match(formSource, /if \(value === 'owner'\) populateShowingOwnerContact\(3\)/);
  assert.match(formSource, /first seller above/);
  assert.match(formSource, /next seller above/);
});

test('confirmed inspectors receive a dated receipt and can revisit or add their appointment to a calendar', () => {
  assert.match(inspectionRequestSource, /vendorPhone: vendor\.phone/);
  assert.match(inspectionConfirmSource, /function buildInspectorConfirmationEmail/);
  assert.match(inspectionConfirmSource, /function sendInspectorConfirmationReceipt/);
  assert.match(inspectionConfirmSource, /Inspector confirmation SMS error/);
  assert.match(inspectionConfirmSource, /Add to Calendar/);
  assert.match(inspectionConfirmSource, /ctz: 'America\/Chicago'/);
  assert.match(inspectionConfirmSource, /confirmedDate: request\.confirmedDate/);
  assert.match(inspectionConfirmSource, /confirmedTime: request\.confirmedTime/);
  assert.match(inspectionSchedulingPageSource, /confirmedDate\?: string/);
  assert.match(inspectionSchedulingPageSource, /confirmedTime\?: string/);
  assert.match(inspectionSchedulingPageSource, /function ConfirmedScheduleDetails/);
  assert.match(inspectionSchedulingPageSource, /Inspection Scheduled/);
  assert.match(inspectionSchedulingPageSource, /Add to Calendar/);
  assert.match(inspectionSchedulingPageSource, /ctz: 'America\/Chicago'/);
});

test('TC edits and approval preserve canonical documents when intake wrappers are empty or partial', () => {
  assert.match(tcApprovalSource, /function mergeDocuments/);
  assert.match(tcApprovalSource, /updates\.documents = mergeDocuments/);
  assert.match(tcApprovalSource, /txSyncUpdate\.documents = mergeDocuments/);
  assert.match(tcApprovalSource, /mergedPayload\.documents = mergeDocuments/);
  assert.match(tcApprovalSource, /preserve every existing canonical document/);
});

test('admin document recovery diagnostic is read-only and compares canonical, intake, and storage metadata', () => {
  const recoverySource = readFileSync(resolve(root, 'src/app/api/admin/diagnostics/document-recovery/route.ts'), 'utf8');
  assert.match(recoverySource, /isAdminLike/);
  assert.match(recoverySource, /canonicalDocuments/);
  assert.match(recoverySource, /intakeRecords/);
  assert.match(recoverySource, /storageCandidates/);
  assert.match(recoverySource, /Read-only metadata only/);
});

test('milestone reminders notify assigned agents only at 3 and 1 days before without duplicates', () => {
  assert.match(transactionReminderSource, /const MILESTONE_REMINDER_DAYS = \[3, 1\] as const/);
  for (const field of ['inspectionDeadline', 'appraisalDeadline', 'finalLoanCommitmentDeadline', 'depositDeadline', 'projectedCloseDate']) {
    assert.match(transactionReminderSource, new RegExp(`field: '${field}'`));
  }
  assert.match(transactionReminderSource, /recipientUids = \[\.\.\.new Set\(\[tx\.agentId, tx\.coAgentId\]/);
  assert.match(transactionReminderSource, /Notify every internal agent assigned to the transaction, but never[\s\S]*TC or staff/);
  assert.match(transactionReminderSource, /const reminderKey = `\$\{milestone\.key\}_\$\{daysBefore\}_days`/);
  assert.match(transactionReminderSource, /if \(sentMap\[reminderKey\] === targetDate\) continue/);
  assert.match(transactionReminderSource, /milestoneRemindersSent\.\$\{reminderKey\}/);
  assert.match(transactionReminderSource, /type: 'agent_task_reminder'/);
  const milestoneSection = transactionReminderSource.split('// ── 4. Agent Milestone Reminders')[1] || '';
  assert.doesNotMatch(milestoneSection, /staffUids|tcId|recipientUids: \[tx\.tcId\]/, 'Milestone reminders must not be broadcast to staff or TC');
});

test('transaction-entered contacts upsert after both creates and edits for the owning agent', () => {
  assert.match(formSource, /const syncContactsToBook = async \(token: string\)/);
  assert.match(formSource, /body: JSON\.stringify\(\{[\s\S]*type,[\s\S]*upsert: true,[\s\S]*viewAs: effectiveUid/);
  assert.match(formSource, /await syncContactsToBook\(token\);[\s\S]*lastSaveSucceededRef\.current = true/);
  assert.match(formSource, /if \(!res\.ok \|\| !data\.ok\) throw new Error\(data\.error \|\| 'Submission failed'\);[\s\S]*await syncContactsToBook\(token\);/);
  assert.match(formSource, /if \(contact\.name \|\| contact\.email \|\| contact\.phone\)/);
  assert.match(formSource, /Add every selected inspection vendor to this agent's Contact Book/);
  assert.match(contactsRouteSource, /let effectiveCreatedBy = \(callerIsStaff && postViewAs\) \? String\(postViewAs\) : uid/);
  assert.match(contactsRouteSource, /ownerAgentId && !postViewAs/);
  assert.match(contactsRouteSource, /where\('createdBy', '==', effectiveCreatedBy\)/);
  assert.match(contactsRouteSource, /contact\.specialties = clean\(fields\.specialties \|\| fields\.specialty\)/);
});

test('Contact Book retrieval keeps newly saved contacts searchable beyond 200 records', () => {
  assert.match(contactsRouteSource, /url\.searchParams\.get\('limit'\) \|\| '500'/);
  assert.match(contactsRouteSource, /Math\.min\(Math\.max\(requestedLimit, 1\), 1000\)/);
});
