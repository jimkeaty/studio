/**
 * Transaction Checklist Definitions
 *
 * Three checklist types:
 *   - new_listing
 *   - under_contract_seller
 *   - under_contract_buyer
 *
 * Each item has:
 *   id, label, group, ifApplicable (boolean)
 *
 * Agent Task Workflow Definitions:
 *   - seller_workflow
 *   - buyer_workflow
 */

export type ChecklistType =
  | 'new_listing'
  | 'under_contract_seller'
  | 'under_contract_buyer';

export type AgentWorkflowType = 'seller_workflow' | 'buyer_workflow';

export interface ChecklistItemDef {
  id: string;
  label: string;
  group: string;
  ifApplicable?: boolean;
}

export interface AgentTaskDef {
  id: string;
  label: string;
  group: string;
  ifApplicable?: boolean;
  /** If set, auto-generate a reminder this many days after closing date */
  postClosingReminderDays?: number;
  /** If true, send a recurring 7-day reminder until closing */
  weeklyReminder?: boolean;
}

/* ─── NEW LISTING CHECKLIST ─────────────────────────────────────────────────── */
export const NEW_LISTING_CHECKLIST: ChecklistItemDef[] = [
  // Setup & MLS
  { id: 'nl_review_details',      label: 'Review transaction details',                                                                                group: 'Setup & MLS' },
  { id: 'nl_sign_ordered',        label: 'Sign ordered',                                                                                              group: 'Setup & MLS', ifApplicable: true },
  { id: 'nl_home_warranty',       label: 'Home Warranty ordered',                                                                                     group: 'Setup & MLS', ifApplicable: true },
  { id: 'nl_showing_time',        label: 'ShowingTime setup',                                                                                         group: 'Setup & MLS', ifApplicable: true },
  { id: 'nl_lockbox',             label: 'Check lockbox into Supra site',                                                                             group: 'Setup & MLS', ifApplicable: true },
  { id: 'nl_skyslope',            label: 'Create Skyslope file & verify all documents are uploaded, signed & initialed',                              group: 'Setup & MLS' },
  { id: 'nl_activate_mls',        label: 'Activate on MLS',                                                                                           group: 'Setup & MLS' },
  { id: 'nl_lacdb',               label: 'Add to LACDB',                                                                                              group: 'Setup & MLS', ifApplicable: true },
  { id: 'nl_attach_docs',         label: 'Attach to MLS & tour: Listing General Info, Plat, Floor Plan, Survey, Property Disclosures, Elevation Certificate', group: 'Setup & MLS', ifApplicable: true },
  // Marketing
  { id: 'nl_photos',              label: 'Photos added to MLS & Google My Business',                                                                  group: 'Marketing', ifApplicable: true },
  { id: 'nl_qr_code',             label: 'Add personalized QR code for sign & text rider',                                                            group: 'Marketing' },
  { id: 'nl_tour_link',           label: 'Link virtual tour',                                                                                         group: 'Marketing', ifApplicable: true },
  { id: 'nl_listing_email',       label: 'Build new listing email & send to sphere and Realtors',                                                     group: 'Marketing', ifApplicable: true },
  { id: 'nl_mailers',             label: 'Just Listed mailers',                                                                                       group: 'Marketing', ifApplicable: true },
  // Outreach & Follow-Up
  { id: 'nl_constant_contact',    label: 'Constant Contact — Add to Keaty Hub',                                                                       group: 'Outreach & Follow-Up' },
  { id: 'nl_reverse_prospecting', label: 'Reverse Prospecting on BoomTown',                                                                           group: 'Outreach & Follow-Up' },
];

/* ─── UNDER CONTRACT — SELLER SIDE CHECKLIST ────────────────────────────────── */
export const UNDER_CONTRACT_SELLER_CHECKLIST: ChecklistItemDef[] = [
  // Documents & Compliance
  { id: 'ucs_purchase_agreement', label: 'Review executed Purchase Agreement — signed & initialed by all parties',   group: 'Documents & Compliance' },
  { id: 'ucs_disclosures',        label: 'Verify Property Disclosures are complete and signed',                       group: 'Documents & Compliance' },
  { id: 'ucs_docs_skyslope',      label: 'Confirm all required documents are in Skyslope',                            group: 'Documents & Compliance' },
  { id: 'ucs_upload_skyslope',    label: 'Upload and verify all executed documents in Skyslope',                      group: 'Documents & Compliance' },
  { id: 'ucs_inspection_dates',   label: 'Confirm inspection period dates and deadlines',                             group: 'Documents & Compliance' },
  { id: 'ucs_closing_date',       label: 'Confirm closing date and title company',                                    group: 'Documents & Compliance' },
  // Status Updates
  { id: 'ucs_mls_status',         label: 'Update MLS status to Under Contract',                                       group: 'Status Updates' },
  { id: 'ucs_lacdb',              label: 'Update LACDB',                                                              group: 'Status Updates', ifApplicable: true },
  { id: 'ucs_cancel_showings',    label: 'Cancel ShowingTime showings',                                               group: 'Status Updates', ifApplicable: true },
  // Close Out
  { id: 'ucs_walkthrough',        label: 'Confirm final walkthrough scheduled',                                       group: 'Close Out' },
  { id: 'ucs_closing_docs',       label: 'Verify all closing documents received and uploaded to Skyslope',            group: 'Close Out' },
  { id: 'ucs_cda',                label: 'Confirm CDA (Commission Disbursement Authorization) submitted',             group: 'Close Out' },
  { id: 'ucs_commission_summary', label: 'Send commission summary to agent',                                          group: 'Close Out' },
  { id: 'ucs_mls_closed',         label: 'Update MLS to Closed/Sold',                                                group: 'Close Out' },
  { id: 'ucs_orphans',            label: 'Add orphaned contacts to contact database',                                 group: 'Close Out' },
  { id: 'ucs_ghl_drip',           label: 'Add contacts to GHL Closed Drip campaign',                                 group: 'Close Out' },
  { id: 'ucs_closed_docs',        label: 'Add all closed documents to Skyslope',                                      group: 'Close Out' },
  { id: 'ucs_skyslope_close',     label: 'Close out Skyslope file',                                                   group: 'Close Out' },
];

/* ─── UNDER CONTRACT — BUYER SIDE CHECKLIST ─────────────────────────────────── */
export const UNDER_CONTRACT_BUYER_CHECKLIST: ChecklistItemDef[] = [
  // Documents & Compliance
  { id: 'ucb_purchase_agreement', label: 'Review executed Purchase Agreement — signed & initialed by all parties',   group: 'Documents & Compliance' },
  { id: 'ucb_buyer_agency',       label: 'Verify Buyer Agency Agreement is on file and signed',                      group: 'Documents & Compliance' },
  { id: 'ucb_disclosures',        label: 'Verify Property Disclosures received and acknowledged',                    group: 'Documents & Compliance' },
  { id: 'ucb_docs_skyslope',      label: 'Confirm all required documents are in Skyslope',                           group: 'Documents & Compliance' },
  { id: 'ucb_upload_skyslope',    label: 'Upload and verify all executed documents in Skyslope',                     group: 'Documents & Compliance' },
  { id: 'ucb_inspection_dates',   label: 'Confirm inspection period dates and deadlines',                            group: 'Documents & Compliance' },
  { id: 'ucb_closing_date',       label: 'Confirm closing date and lender/title company',                            group: 'Documents & Compliance' },
  // Status Updates
  { id: 'ucb_lender_contract',    label: 'Confirm lender has received executed contract',                            group: 'Status Updates' },
  { id: 'ucb_title_contract',     label: 'Confirm title company has received executed contract',                     group: 'Status Updates' },
  { id: 'ucb_contingencies',      label: 'Track inspection deadlines and contingency removals',                      group: 'Status Updates' },
  // Close Out
  { id: 'ucb_walkthrough',        label: 'Confirm final walkthrough scheduled',                                      group: 'Close Out' },
  { id: 'ucb_closing_docs',       label: 'Verify all closing documents received and uploaded to Skyslope',           group: 'Close Out' },
  { id: 'ucb_cda',                label: 'Confirm CDA (Commission Disbursement Authorization) submitted',            group: 'Close Out' },
  { id: 'ucb_commission_summary', label: 'Send commission summary to agent',                                         group: 'Close Out' },
  { id: 'ucb_mls_closed',         label: 'Update MLS to Closed/Sold',                                               group: 'Close Out' },
  { id: 'ucb_orphans',            label: 'Add orphaned contacts to contact database',                                group: 'Close Out' },
  { id: 'ucb_ghl_drip',           label: 'Add contacts to GHL Closed Drip campaign',                                group: 'Close Out' },
  { id: 'ucb_closed_docs',        label: 'Add all closed documents to Skyslope',                                     group: 'Close Out' },
  { id: 'ucb_skyslope_close',     label: 'Close out Skyslope file',                                                  group: 'Close Out' },
];

/* ─── AGENT TASK WORKFLOW — SELLER SIDE ─────────────────────────────────────── */
export const SELLER_AGENT_TASKS: AgentTaskDef[] = [
  // After Listing Taken
  { id: 'at_boomtown_setup',    label: 'Set up sellers in BoomTown to receive neighborhood listings',  group: 'After Listing Taken' },
  { id: 'at_thank_you_note',    label: 'Send thank you note to sellers',                               group: 'After Listing Taken' },
  { id: 'at_home_warranty',     label: 'Order home warranty',                                          group: 'After Listing Taken', ifApplicable: true },
  { id: 'at_schedule_photos',   label: 'Schedule photos and drone',                                    group: 'After Listing Taken' },
  { id: 'at_meet_stager',       label: 'Meet with stager',                                             group: 'After Listing Taken' },
  { id: 'at_qr_code',           label: 'Assign personalized QR code',                                  group: 'After Listing Taken' },
  { id: 'at_rider',             label: 'Attach personalized rider to sign',                            group: 'After Listing Taken' },
  { id: 'at_lockbox',           label: 'Check out lockbox',                                            group: 'After Listing Taken' },
  { id: 'at_optimize_tour',     label: 'Optimize virtual tour',                                        group: 'After Listing Taken' },
  { id: 'at_send_tour',         label: 'Send tour link to sellers',                                    group: 'After Listing Taken' },
  { id: 'at_send_listing',      label: 'Send sellers their listing',                                   group: 'After Listing Taken' },
  { id: 'at_brochure',          label: 'Create brochure for home',                                     group: 'After Listing Taken' },
  { id: 'at_table_tent',        label: 'Add table tent with QR code and tour on counter',              group: 'After Listing Taken' },
  { id: 'at_weekly_hug',        label: 'Weekly "Hug" calls with sellers',                              group: 'After Listing Taken', weeklyReminder: true },
  // Before Closing
  { id: 'at_review_cd',         label: 'Review CD (Closing Disclosure)',                               group: 'Before Closing' },
  { id: 'at_confirm_walkthrough',label: 'Confirm final walkthrough scheduled',                         group: 'Before Closing' },
  { id: 'at_inspection_items',  label: 'Confirm all inspection items resolved',                        group: 'Before Closing' },
  { id: 'at_commission_review', label: 'Review commission summary',                                    group: 'Before Closing' },
  { id: 'at_closing_gift',      label: 'Order closing gift',                                           group: 'Before Closing' },
  { id: 'at_thank_you_cards',   label: 'Send thank you cards',                                         group: 'Before Closing' },
  // After Closing
  { id: 'at_add_orphans',       label: 'Add orphaned contacts to CRM',                                 group: 'After Closing' },
  { id: 'at_change_status',     label: 'Change seller status to Closed in CRM',                        group: 'After Closing' },
  { id: 'at_checkin_7',         label: 'Check in with sellers in 7 days',                              group: 'After Closing', postClosingReminderDays: 7 },
];

/* ─── AGENT TASK WORKFLOW — BUYER SIDE ──────────────────────────────────────── */
export const BUYER_AGENT_TASKS: AgentTaskDef[] = [
  // After Contract Executed
  { id: 'bt_home_warranty',     label: 'Order home warranty',                                          group: 'After Contract Executed', ifApplicable: true },
  { id: 'bt_inspection',        label: 'Confirm inspection scheduled',                                 group: 'After Contract Executed' },
  { id: 'bt_weekly_checkin',    label: 'Weekly check-ins with buyer',                                  group: 'After Contract Executed', weeklyReminder: true },
  // Before Closing
  { id: 'bt_walkthrough',       label: 'Confirm final walkthrough scheduled',                          group: 'Before Closing' },
  { id: 'bt_commission_review', label: 'Review commission summary',                                    group: 'Before Closing' },
  { id: 'bt_review_cd',         label: 'Review CD (Closing Disclosure)',                               group: 'Before Closing' },
  { id: 'bt_closing_gift',      label: 'Order closing gift',                                           group: 'Before Closing' },
  { id: 'bt_thank_you_cards',   label: 'Send thank you cards',                                         group: 'Before Closing' },
  // After Closing
  { id: 'bt_add_orphans',       label: 'Add orphaned contacts to CRM',                                 group: 'After Closing' },
  { id: 'bt_change_status',     label: 'Change buyer status to Closed in CRM',                         group: 'After Closing' },
  { id: 'bt_checkin_3',         label: 'Check in with buyers in 3 days',                               group: 'After Closing', postClosingReminderDays: 3 },
  { id: 'bt_checkin_14',        label: 'Check in with buyers in 14 days',                              group: 'After Closing', postClosingReminderDays: 14 },
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
export function getChecklistDef(type: ChecklistType): ChecklistItemDef[] {
  switch (type) {
    case 'new_listing':             return NEW_LISTING_CHECKLIST;
    case 'under_contract_seller':   return UNDER_CONTRACT_SELLER_CHECKLIST;
    case 'under_contract_buyer':    return UNDER_CONTRACT_BUYER_CHECKLIST;
  }
}

export function getAgentTaskDef(type: AgentWorkflowType): AgentTaskDef[] {
  switch (type) {
    case 'seller_workflow': return SELLER_AGENT_TASKS;
    case 'buyer_workflow':  return BUYER_AGENT_TASKS;
  }
}

export function checklistTypeLabel(type: ChecklistType): string {
  switch (type) {
    case 'new_listing':           return 'New Listing';
    case 'under_contract_seller': return 'Under Contract — Seller';
    case 'under_contract_buyer':  return 'Under Contract — Buyer';
  }
}
