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
const transactionSectionsSource = readFileSync(resolve(root, 'src/components/transactions/TransactionFormSections.tsx'), 'utf8');
const transactionReminderSource = readFileSync(resolve(root, 'src/app/api/cron/transaction-reminders/route.ts'), 'utf8');
const contactsRouteSource = readFileSync(resolve(root, 'src/app/api/contacts/route.ts'), 'utf8');

test('new buyer transactions default to the editable $395 compliance fee', () => {
  assert.match(formSource, /txComplianceFee: initialClosingType === 'buyer' \? 'yes' : ''/);
  assert.match(formSource, /txComplianceFeeAmount: initialClosingType === 'buyer' \? 395 : ''/);
  assert.match(formSource, /if \(editMode \|\| watchedClosingType !== 'buyer'\) return/);
  assert.match(formSource, /form\.setValue\('txComplianceFeeAmount', 395 as any\)/);
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
  assert.match(formSource, /const responseText = await res\.text\(\);/);
  assert.match(transactionSectionsSource, /const responseText = await res\.text\(\);/);
  assert.match(inspectionRequestSource, /Selected vendor has no email address or mobile number/);
  assert.match(inspectionRequestSource, /No active vendors with an email address or mobile number found/);
  assert.match(inspectionRequestSource, /smsSent/);
  assert.match(inspectionRequestSource, /TWILIO_ACCOUNT_SID/);
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
  assert.match(contactsRouteSource, /const effectiveCreatedBy = \(callerIsStaff && postViewAs\) \? postViewAs : uid/);
  assert.match(contactsRouteSource, /where\('createdBy', '==', effectiveCreatedBy\)/);
  assert.match(contactsRouteSource, /contact\.specialties = \(fields\.specialties \|\| fields\.specialty \|\| ''\)\.trim\(\)/);
});
