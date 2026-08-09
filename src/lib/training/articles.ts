/**
 * Keaty Real Estate — Training & Help Center Article Library
 *
 * To add a new article:
 *  1. Add a new entry to the ARTICLES array below.
 *  2. Set `audience` to 'agent', 'staff', or 'both'.
 *  3. Set `category` to an existing category or create a new one.
 *  4. Write the full guide in `content` using HTML (supports headings, paragraphs,
 *     tables, lists, blockquotes, and inline code).
 */

export type ArticleAudience = 'agent' | 'staff' | 'both';

export type Article = {
  id: string;
  title: string;
  description: string;
  category: string;
  audience: ArticleAudience;
  readingTimeMinutes: number;
  publishedAt: string; // ISO date string
  content: string;     // HTML string rendered in the detail page
};

// ─── Category definitions ─────────────────────────────────────────────────────
export const CATEGORIES = [
  'Transactions',
  'Dashboard',
  'Team & Commission',
  'Admin Tools',
  'Getting Started',
] as const;

export type Category = (typeof CATEGORIES)[number];

// ─── Article library ──────────────────────────────────────────────────────────
export const ARTICLES: Article[] = [
  // ── STAFF QUEUE ─────────────────────────────────────────────────────────────
  {
    id: 'staff-queue-overview',
    title: 'Staff Queue: Overview & Workflow',
    description:
      'Learn how the Staff Queue works, what triggers items to appear, and how to process new listings and status changes step by step.',
    category: 'Transactions',
    audience: 'staff',
    readingTimeMinutes: 6,
    publishedAt: '2026-04-23',
    content: `
<h2>What Is the Staff Queue?</h2>
<p>The Staff Queue is a centralized inbox for administrative staff, transaction coordinators (TCs), and management. It captures every new listing submission and every MLS-relevant status change made by agents, ensuring that no update is missed and that the brokerage's MLS records stay accurate and compliant.</p>
<p>The queue is accessible to users with <strong>Admin</strong>, <strong>Staff</strong>, or <strong>TC</strong> roles. You can find it in the sidebar under <strong>Transactions → Staff Queue</strong>.</p>

<h2>What Triggers a Staff Queue Item?</h2>
<table>
  <thead><tr><th>Trigger</th><th>Action Type</th><th>Also Goes to TC Queue?</th></tr></thead>
  <tbody>
    <tr><td>Agent submits a new listing (Working with TC ✅)</td><td>New Listing</td><td>Yes</td></tr>
    <tr><td>Agent submits a new listing (No TC ❌)</td><td>New Listing</td><td>No</td></tr>
    <tr><td>Agent submits a new listing as <strong>Coming Soon</strong> (Working with TC ✅)</td><td>New Listing</td><td>Yes</td></tr>
    <tr><td>Agent submits a new listing as <strong>Coming Soon</strong> (No TC ❌)</td><td>New Listing</td><td>No</td></tr>
    <tr><td>Agent changes status to Active, Coming Soon, Pending, Temp Off Market, Closed, Cancelled, or Expired</td><td>Status Change</td><td>No</td></tr>
    <tr><td>System auto-activates a Coming Soon listing (30-day rule)</td><td>Status Change</td><td>Yes (if TC assigned)</td></tr>
    <tr><td>Admin changes status in the Transaction Ledger</td><td>—</td><td>No (not triggered)</td></tr>
  </tbody>
</table>

<h2>The List View</h2>
<p>The main Staff Queue page gives you an at-a-glance overview of everything that needs attention.</p>

<h3>Summary Cards</h3>
<p>Four cards across the top show real-time counts for the current filter:</p>
<ul>
  <li><strong>Pending Review (Amber)</strong> — Items waiting for initial staff action.</li>
  <li><strong>In Progress (Blue)</strong> — Items a staff member has started but not yet completed.</li>
  <li><strong>Completed (Green)</strong> — Fully processed items.</li>
  <li><strong>Total (Slate)</strong> — Total items matching the active filters.</li>
</ul>
<p>If any items are in Pending Review, an amber <em>Action Required</em> banner will appear below the cards as a visual reminder.</p>

<h3>Filters</h3>
<ul>
  <li><strong>Search bar</strong> — Find items by property address, agent name, or submitter name.</li>
  <li><strong>Queue Status filter</strong> — Show Active (Pending + In Progress), All Items, or a specific status.</li>
  <li><strong>Action Type filter</strong> — Show all types, or filter to New Listing, Status Change, or Update only.</li>
</ul>

<h3>Table Columns</h3>
<table>
  <thead><tr><th>Column</th><th>Description</th></tr></thead>
  <tbody>
    <tr><td>Queue Status</td><td>Color-coded badge: Pending Review (amber), In Progress (blue), Completed (green), Dismissed (gray).</td></tr>
    <tr><td>Action Type</td><td>Green badge for New Listing; purple badge for Status Change.</td></tr>
    <tr><td>Address</td><td>The property address for the transaction.</td></tr>
    <tr><td>Agent</td><td>The listing agent's name.</td></tr>
    <tr><td>Status Change</td><td>For status changes, shows the transition (e.g., Active → Pending).</td></tr>
    <tr><td>Submitted</td><td>Date the item was generated.</td></tr>
    <tr><td>Reviewed By</td><td>Staff member who last updated the item.</td></tr>
    <tr><td>Actions</td><td>"Review →" link to open the detail page.</td></tr>
  </tbody>
</table>

<h2>The Detail / Review Page</h2>
<p>Clicking <strong>Review →</strong> opens the full detail page for that item. This is where you do the actual work.</p>

<h3>Left Column — Queue Details & Staff Notes</h3>
<ul>
  <li><strong>Queue Details card</strong> — Shows the action type, agent name, whether a TC is involved, submission date, and any notes the agent included.</li>
  <li><strong>Staff Notes card</strong> — A text area for logging internal notes (e.g., "Added to MLS, MLS# 123456"). Click <em>Save Notes Only</em> to save notes without touching the transaction.</li>
</ul>

<h3>Right Column — Transaction Editing</h3>
<p>All changes made here are saved directly to the Transaction Ledger when you click Save.</p>
<ul>
  <li><strong>Transaction Details</strong> — Status, sale price, property address, and all four date fields (Contract Date, Close Date, Projected Close Date, Inspection Deadline).</li>
  <li><strong>Buyer Information</strong> — Buyer name, email, and phone.</li>
  <li><strong>Seller Information</strong> — Seller name, email, and phone.</li>
  <li><strong>Transaction Notes</strong> — Free-text notes on the transaction.</li>
</ul>

<h3>Action Buttons</h3>
<table>
  <thead><tr><th>Button</th><th>What It Does</th></tr></thead>
  <tbody>
    <tr><td>Open in Ledger</td><td>Opens the transaction in the Admin Transaction Ledger for full access.</td></tr>
    <tr><td>Dismiss</td><td>Marks the item dismissed (no ledger changes). Use for duplicates or errors.</td></tr>
    <tr><td>Save Changes</td><td>Saves all edits to the ledger and keeps the item In Progress.</td></tr>
    <tr><td>Save &amp; Mark Complete</td><td>Saves all edits to the ledger and marks the queue item Completed. Returns you to the list.</td></tr>
  </tbody>
</table>
<blockquote>Once an item is Completed or Dismissed, all fields become read-only to preserve the historical record.</blockquote>

<h2>Step-by-Step: Processing a New Listing</h2>
<ol>
  <li>An agent submits a new listing via <strong>Add Transaction</strong>.</li>
  <li>Open the Staff Queue — you'll see the item with a green <em>New Listing</em> badge.</li>
  <li>Click <strong>Review →</strong> to open the detail page.</li>
  <li>Review the agent's notes and verify all property details.</li>
  <li>Log into the MLS and enter the listing information.</li>
  <li>Return to the detail page and add a note in <strong>Staff Notes</strong> (e.g., "Added to MLS — MLS# 456789").</li>
  <li>Click <strong>Save &amp; Mark Complete</strong>.</li>
</ol>

<h2>Step-by-Step: Processing a Status Change</h2>
<ol>
  <li>An agent changes a transaction status (e.g., Active → Pending) from their dashboard.</li>
  <li>Open the Staff Queue — you'll see the item with a purple <em>Status Change</em> badge showing the transition.</li>
  <li>Click <strong>Review →</strong> to open the detail page.</li>
  <li>Verify the new status and any updated dates (e.g., Contract Date, Projected Close Date).</li>
  <li>Update the MLS to reflect the new status.</li>
  <li>Add a note in <strong>Staff Notes</strong> (e.g., "Updated MLS to Pending").</li>
  <li>Click <strong>Save &amp; Mark Complete</strong>.</li>
</ol>
    `,
  },

  // ── MY TRANSACTIONS (AGENT) ──────────────────────────────────────────────────
  {
    id: 'agent-my-transactions',
    title: 'My Transactions: Managing Your Deals',
    description:
      'How to view, search, filter, and update your active, pending, and closed transactions directly from your agent dashboard.',
    category: 'Transactions',
    audience: 'agent',
    readingTimeMinutes: 5,
    publishedAt: '2026-04-23',
    content: `
<h2>Overview</h2>
<p>The <strong>My Transactions</strong> section on your dashboard gives you a full ledger-style view of every deal you're working on — active listings, pending contracts, and closed transactions from any year. You can search, filter, and update deal details without ever leaving your dashboard.</p>

<h2>Finding Your Transactions</h2>
<p>Your transactions are organized into three tabs:</p>
<ul>
  <li><strong>Active</strong> — Listings currently on the market (Active and Temp Off Market).</li>
  <li><strong>Pending</strong> — Deals under contract.</li>
  <li><strong>Closed</strong> — Completed transactions. Use the year selector to browse historical years.</li>
</ul>
<p>Use the <strong>search bar</strong> to find a specific property by address, and use the <strong>status filter</strong> to narrow down by a specific status.</p>

<h2>Updating a Transaction</h2>
<p>Click the <strong>status badge</strong> on any row to open a quick-edit drawer for that transaction. From there you can update:</p>
<ul>
  <li>Status (Active, Temp Off Market, Pending, Closed, Cancelled, Expired)</li>
  <li>Sale price</li>
  <li>Contract Date, Close Date, Projected Close Date, and Inspection Deadline</li>
  <li>Buyer and Seller contact information</li>
  <li>Transaction notes</li>
</ul>
<blockquote>When you change the status of a listing, the Staff Queue is automatically notified so the team can update the MLS on your behalf.</blockquote>

<h2>Status Definitions</h2>
<table>
  <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td>Active</td><td>The listing is live on the market.</td></tr>
    <tr><td>Temp Off Market</td><td>The listing is temporarily withdrawn but not cancelled.</td></tr>
    <tr><td>Pending</td><td>The property is under contract.</td></tr>
    <tr><td>Closed</td><td>The transaction has closed. A closing date is required.</td></tr>
    <tr><td>Cancelled</td><td>The listing or contract has been cancelled.</td></tr>
    <tr><td>Expired</td><td>The listing agreement has expired.</td></tr>
  </tbody>
</table>

<h2>Important Notes</h2>
<ul>
  <li>Active and Pending transactions always show for the current year, regardless of the year filter.</li>
  <li>Setting a status to <strong>Closed</strong> requires a closing date before saving.</li>
  <li><strong>Temp Off Market</strong> cannot be set on a transaction that is already Closed or Sold.</li>
  <li>Changing status to <strong>Pending</strong> re-submits the deal to the TC Queue for review if you are working with a TC.</li>
</ul>
    `,
  },

  // ── ADD TRANSACTION (AGENT) ──────────────────────────────────────────────────
  {
    id: 'agent-add-transaction',
    title: 'Submitting a New Transaction',
    description:
      'A step-by-step guide to submitting a new listing or deal, including the only required fields at each stage and what happens after you submit.',
    category: 'Transactions',
    audience: 'agent',
    readingTimeMinutes: 5,
    publishedAt: '2026-04-23',
    content: `
<h2>Overview</h2>
<p>Use the <strong>Add Transaction</strong> button in the sidebar (or the center button on mobile) to submit any new listing or deal to the system. The form routes your submission to the correct queues automatically. The system is designed to be as frictionless as possible — you only need a handful of fields to get started, and you can fill in the rest later.</p>

<h2>Required Fields by Stage</h2>
<p>The system enforces a minimal set of required fields at each stage. Everything else is optional and can be added or updated at any time.</p>

<h3>Adding a New Listing (Active or Coming Soon)</h3>
<table>
  <thead><tr><th>#</th><th>Field</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td>1</td><td><strong>Status</strong></td><td>Active, Coming Soon, or Pending</td></tr>
    <tr><td>2</td><td><strong>Closing Type</strong></td><td>Listing, Buyer, Dual, or Referral</td></tr>
    <tr><td>3</td><td><strong>Property Address</strong></td><td>Street address of the property</td></tr>
    <tr><td>4</td><td><strong>Client Name</strong></td><td>Seller’s name for listings; buyer’s name for buyer-side deals</td></tr>
    <tr><td>5</td><td><strong>Working with TC?</strong></td><td>Yes/No — routes submission to TC Queue if Yes</td></tr>
  </tbody>
</table>
<p>All other fields — List Price, Commission %, ShowingTime, Staging, Inspections, Media, Sign Requests — are optional at this stage. Fill them in now or come back later.</p>

<h3>Changing Status: Active / Coming Soon → Pending</h3>
<p><strong>No additional fields are required</strong> by the system to save this status change. Simply open the transaction from your dashboard and update the Status field. That said, you should upload the executed Purchase Agreement and fill in the Sale Price, Buyer Contact, and Closing Date so your TC and staff can begin processing the file promptly.</p>

<h3>Changing Status: Pending → Closed</h3>
<p><strong>No additional fields are required</strong> to mark a transaction Closed. The system will automatically route the closed transaction to the Staff Queue for final processing and commission payout.</p>

<h2>Step-by-Step: Submitting a New Listing</h2>
<ol>
  <li>Click <strong>Add Transaction</strong> in the sidebar.</li>
  <li>Select a <strong>Status</strong>: choose <em>Active</em> for a standard new listing, <em>Coming Soon</em> if the property is not yet ready to go fully Active on the MLS, or <em>Pending</em> if already under contract. See the <a href="/dashboard/training/coming-soon-listings">Coming Soon Listings guide</a> for details.</li>
  <li>Select the <strong>Closing Type</strong> (Listing for seller-side, Buyer for buyer-side, Dual if representing both).</li>
  <li>Enter the <strong>Property Address</strong> and <strong>Client Name</strong>.</li>
  <li>Toggle <strong>"Working with TC"</strong> to Yes if a Transaction Coordinator is handling your paperwork.</li>
  <li>Fill in any additional details you have available (List Price, Sign Order, ShowingTime, Media, Staging, Inspections).</li>
  <li>Add any notes for staff or your TC in the <strong>Notes</strong> field.</li>
  <li>Click <strong>Submit</strong>.</li>
</ol>

<h2>What Happens After You Submit</h2>
<ul>
  <li>Your transaction appears immediately in your <strong>My Transactions</strong> dashboard.</li>
  <li>A <strong>Staff Queue</strong> item is created so staff can update the MLS and handle sign/media requests.</li>
  <li>If you toggled "Working with TC" to Yes, a <strong>TC Queue</strong> item is also created for your TC to review and process the paperwork.</li>
  <li>You will receive an in-app notification confirming the submission.</li>
</ul>

<h2>Saving a Draft</h2>
<p>If you start filling out the form but need to stop before submitting, the system will save your progress as a <strong>Draft</strong>. You can find and resume drafts from the <em>Drafts</em> section on your dashboard. See the <a href="/dashboard/training/agent-transaction-drafts">Saving and Resuming Drafts guide</a> for details.</p>
    `,
  },

  // ── NOTIFICATIONS (AGENT & STAFF) ────────────────────────────────────────────
  {
    id: 'notification-settings',
    title: 'Managing Your Notification Preferences',
    description:
      'How to control which alerts you receive and where you receive them (In-App, Push, Email, SMS).',
    category: 'Dashboard',
    audience: 'both',
    readingTimeMinutes: 3,
    publishedAt: '2026-05-06',
    content: `
<h2>Overview</h2>
<p>The Smart Broker platform sends notifications for important events like TC approvals, staff queue updates, and transaction status changes. You have full control over how you receive these alerts.</p>

<h2>Accessing Notification Settings</h2>
<p>Click <strong>Notification Settings</strong> in the sidebar (under your profile or the main menu). Here you can toggle notifications on or off globally by channel, or fine-tune them by specific events.</p>

<h2>Notification Channels</h2>
<table>
  <thead><tr><th>Channel</th><th>Description</th><th>Default</th></tr></thead>
  <tbody>
    <tr><td><strong>In-App</strong></td><td>Alerts that appear in the bell icon menu inside the dashboard.</td><td>ON</td></tr>
    <tr><td><strong>Push</strong></td><td>Browser or mobile device notifications. Requires you to click "Enable Push Notifications" to grant browser permission.</td><td>ON</td></tr>
    <tr><td><strong>Email</strong></td><td>Detailed alerts sent to your registered email address.</td><td>ON</td></tr>
    <tr><td><strong>SMS</strong></td><td>Text messages sent to your phone.</td><td>OFF (Opt-in required)</td></tr>
  </tbody>
</table>

<h2>Event-Specific Toggles</h2>
<p>Below the global channel toggles, you can turn specific events on or off entirely:</p>
<ul>
  <li><strong>TC Approvals & Rejections</strong> — Alerts when a Transaction Coordinator reviews your submitted deal.</li>
  <li><strong>Transaction Status Changes</strong> — Alerts when a deal moves to Pending, Closed, etc.</li>
  <li><strong>Staff Queue Updates</strong> — Alerts when admin staff process your listings.</li>
  <li><strong>Co-Agent Splits</strong> — Alerts when a shared transaction closes and is split into your individual record.</li>
</ul>
    `,
  },

  // ── TRANSACTION COMPLIANCE FEE (AGENT) ───────────────────────────────────────
  {
    id: 'transaction-compliance-fee',
    title: 'Handling the Transaction Compliance Fee',
    description:
      'How the compliance fee works, who pays it, and how it affects your commission preview.',
    category: 'Transactions',
    audience: 'agent',
    readingTimeMinutes: 4,
    publishedAt: '2026-05-06',
    content: `
<h2>Overview</h2>
<p>When submitting a transaction, you must specify whether a <strong>Transaction Compliance Fee</strong> applies and who is paying for it. This ensures accurate commission calculations and clear instructions for the title company.</p>

<h2>Where to Set the Fee</h2>
<p>In the Add Transaction form, scroll down to the <strong>Additional Info</strong> section. You will see a toggle for <em>Transaction Compliance Fee?</em></p>
<p>If your agent profile has a default fee set, this will automatically toggle to <strong>Yes</strong> and pre-fill the amount. You can change this on a per-transaction basis.</p>

<h2>Who Pays the Fee?</h2>
<p>You must select who is responsible for the fee from the dropdown:</p>
<table>
  <thead><tr><th>Payer</th><th>How It Affects Your Commission</th><th>What You See in Preview</th></tr></thead>
  <tbody>
    <tr><td><strong>Agent</strong></td><td>The fee is deducted from your final take-home pay <em>after</em> the broker split.</td><td>A red deduction line (e.g., -$295) in the commission breakdown.</td></tr>
    <tr><td><strong>Buyer</strong></td><td>No deduction from your commission.</td><td>A blue note reminding you to collect the fee from the buyer/title at closing.</td></tr>
    <tr><td><strong>Seller</strong></td><td>No deduction from your commission.</td><td>A blue note stating the fee is covered by the seller.</td></tr>
    <tr><td><strong>Seller Closing Cost</strong></td><td>No deduction from your commission.</td><td>A blue note stating the fee comes from seller concessions.</td></tr>
  </tbody>
</table>

<h2>Important Note on Commission Tiers</h2>
<p>Regardless of who pays the fee, your <strong>Commission Tier</strong> and <strong>Broker Split</strong> are always calculated based on the <strong>Full Gross Commission Income (GCI)</strong>. The fee is never subtracted from the GCI before the split is calculated.</p>
    `,
  },

  // ── TC APPROVAL WORKFLOW (STAFF) ─────────────────────────────────────────────
  {
    id: 'tc-approval-workflow',
    title: 'TC Queue: Reviewing & Approving Transactions',
    description:
      'How to process agent submissions, handle compliance fees, and approve deals into the ledger.',
    category: 'Transactions',
    audience: 'staff',
    readingTimeMinutes: 5,
    publishedAt: '2026-05-06',
    content: `
<h2>Overview</h2>
<p>When an agent submits a transaction and checks "Working with TC," it enters the <strong>TC Queue</strong>. As a Transaction Coordinator or Admin, your job is to review the details, ensure compliance, and approve the deal. Approving the deal creates the official record in the Transaction Ledger.</p>

<h2>The Review Process</h2>
<ol>
  <li>Open the <strong>TC Queue</strong> from the sidebar.</li>
  <li>Click <strong>Review →</strong> on any Pending item.</li>
  <li>Review the agent's submitted data on the left side of the screen.</li>
  <li>Fill out the official form on the right side. The system will auto-fill most fields based on the agent's submission.</li>
</ol>

<h2>Handling the Transaction Compliance Fee</h2>
<p>In the <strong>Additional Info</strong> section, you must verify the Transaction Compliance Fee settings:</p>
<ul>
  <li><strong>Is there a fee?</strong> (Yes/No)</li>
  <li><strong>Amount:</strong> (e.g., $295)</li>
  <li><strong>Who Pays:</strong> Agent, Buyer, Seller, or Seller Closing Cost.</li>
</ul>
<p>If the <strong>Agent</strong> pays, the fee will be deducted from their final take-home pay. If anyone else pays, the agent receives their full split, and the fee must be collected at closing.</p>

<h2>Approving vs. Rejecting</h2>
<ul>
  <li><strong>Approve:</strong> Creates the official transaction in the ledger and sends an approval notification to the agent.</li>
  <li><strong>Reject:</strong> Sends the transaction back to the agent with your notes. The agent will receive a notification and must edit and resubmit the deal from their dashboard.</li>
</ul>
    `,
  },

  // ── CO-AGENT SPLITS (ADMIN/STAFF) ─────────────────────────────────────────────
  {
    id: 'admin-co-agent-splits',
    title: 'Admin: Managing Co-Agent Transaction Splits',
    description:
      'How the system handles co-agent deals at closing, what the ledger shows, and what to do if a split needs correction.',
    category: 'Admin Tools',
    audience: 'staff',
    readingTimeMinutes: 4,
    publishedAt: '2026-05-06',
    content: `
<h2>Overview</h2>
<p>When a transaction in the ledger has a co-agent assigned, it will automatically split into two individual records the moment it is moved to <strong>Closed</strong> status. This applies whether the status is changed by the agent from their dashboard or by an admin from the Transaction Ledger.</p>

<h2>What Happens at Closing</h2>
<ol>
  <li>The single shared transaction is <strong>permanently deleted</strong> from the ledger.</li>
  <li>Two new individual transactions are created — one for each agent.</li>
  <li>The Sale Price and GCI are split according to the percentages set on the original transaction.</li>
  <li>Each agent's commission tier is applied independently to their portion of the GCI.</li>
  <li>The Transaction Compliance Fee (if any) is split equally between the two records.</li>
  <li>Both agents receive a notification with a link to their new individual transaction.</li>
</ol>

<h2>Audit Trail</h2>
<p>Each split transaction carries a <code>splitFromTransactionId</code> field that references the original shared transaction's ID. This is stored in Firestore and can be used for audit or reconciliation purposes.</p>

<h2>Correcting a Split</h2>
<p>If a split produces incorrect numbers (e.g., the wrong split percentage was set), you can edit either individual transaction directly in the <strong>Transaction Ledger</strong> using the Admin Edit page. Adjust the GCI, commission fields, or agent assignment as needed. The split itself cannot be undone, but the resulting records are fully editable.</p>
    `,
  },

  // ── TEAM COMMISSION MODEL (ADMIN/STAFF) ─────────────────────────────────────
  {
    id: 'admin-team-commission-model',
    title: 'Admin: Team Leader & Member Commission Model',
    description:
      'How the system calculates commissions for team members on teams with a Team Leader.',
    category: 'Team & Commission',
    audience: 'staff',
    readingTimeMinutes: 5,
    publishedAt: '2026-05-06',
    content: `
<h2>Overview</h2>
<p>For agents on a team that has a designated <strong>Team Leader</strong>, commission calculations involve three parties: the Brokerage, the Team Member, and the Team Leader. The Team Leader's commission tier determines the broker's cut, and the member's individual split is applied to the full GCI.</p>

<h2>The Calculation Model</h2>
<table>
  <thead><tr><th>Party</th><th>Calculation</th><th>Example ($1,800 GCI, Leader 75%, Member 70%)</th></tr></thead>
  <tbody>
    <tr><td><strong>Broker</strong></td><td>GCI × (100% − Leader Tier %)</td><td>$1,800 × 25% = <strong>$450</strong></td></tr>
    <tr><td><strong>Team Member</strong></td><td>GCI × Member Split %</td><td>$1,800 × 70% = <strong>$1,260</strong></td></tr>
    <tr><td><strong>Team Leader</strong></td><td>GCI − Broker − Member (the spread)</td><td>$1,800 − $450 − $1,260 = <strong>$90</strong></td></tr>
  </tbody>
</table>

<h2>Leaderboard & Dashboard Rules</h2>
<ul>
  <li>The <strong>Team Member's</strong> volume and GCI are credited to their personal leaderboard and dashboard.</li>
  <li>The <strong>Team Leader</strong> does <em>not</em> receive the team member's volume or GCI on their personal leaderboard. Only the leader's own direct transactions count toward their personal numbers.</li>
  <li>Both the team member's and team leader's commission tiers progress based on the GCI from the transaction.</li>
</ul>

<h2>Configuring Team Commission</h2>
<p>Team commission structures are set in <strong>Admin → Teams</strong>. Each team can use either a <em>Tiered Commission</em> model (with progression thresholds) or a <em>Fixed Commission</em> model (flat split, no tiers). Individual agent profiles can override the team default with custom tiers if needed.</p>
    `,
  },

  // ── CO-AGENT SPLITS (AGENT) ──────────────────────────────────────────────────
  {
    id: 'co-agent-splits',
    title: 'Co-Agent Transactions & Automatic Splits',
    description:
      'How deals with co-agents are handled and what happens when they close.',
    category: 'Team & Commission',
    audience: 'agent',
    readingTimeMinutes: 3,
    publishedAt: '2026-05-06',
    content: `
<h2>Submitting a Co-Agent Deal</h2>
<p>When you work a deal with another agent in the brokerage, you only need to submit <strong>one transaction</strong>. In the Add Transaction form, toggle <em>Has Co-Agent?</em> to <strong>Yes</strong>, select the agent, and enter the split percentage (e.g., 50/50).</p>

<h2>What Happens While Pending</h2>
<p>While the deal is Active or Pending, it exists as a single shared transaction in the ledger. The primary agent manages the updates.</p>

<h2>The Automatic Split at Closing</h2>
<p>The magic happens when the transaction status is changed to <strong>Closed</strong>. The system will automatically:</p>
<ol>
  <li>Delete the single shared transaction.</li>
  <li>Create <strong>two separate, individual transactions</strong> — one for you and one for your co-agent.</li>
  <li>Split the Sale Price and GCI according to the percentages you set.</li>
  <li>Apply each agent's individual commission tier to their portion of the GCI.</li>
  <li>Send a notification to both agents with a link to their new individual record.</li>
</ol>

<h2>Why We Do This</h2>
<p>Splitting the transaction at closing ensures that your personal dashboard, conversion rates, and average commission percentages remain perfectly accurate. If you split a 3% commission 50/50, your record will show you earned 3% on half the volume, rather than 1.5% on the full volume.</p>
    `,
  },

  // ── TEAM MEMBER COMMISSION MODEL (AGENT) ─────────────────────────────────────
  {
    id: 'team-member-commission',
    title: 'Understanding Your Team Commission Split',
    description:
      'How commission is calculated if you are on a team with a Team Leader.',
    category: 'Team & Commission',
    audience: 'agent',
    readingTimeMinutes: 4,
    publishedAt: '2026-05-06',
    content: `
<h2>The Commission Model</h2>
<p>If you are a member of a team that has a Team Leader, your commission calculation involves three parties: You, the Brokerage, and the Team Leader.</p>

<p>The math works like this:</p>
<ol>
  <li><strong>Broker Cut:</strong> The brokerage takes its percentage based on the <em>Team Leader's</em> commission tier.</li>
  <li><strong>Your Split:</strong> You take home your agreed-upon percentage applied directly to the <em>Full GCI</em>.</li>
  <li><strong>Leader Retains:</strong> The Team Leader keeps the spread (whatever is left over after the broker and you are paid).</li>
</ol>

<h2>Example Breakdown</h2>
<p>Imagine a deal with <strong>$1,800 GCI</strong>. The Team Leader is on a 75/25 split with the broker. Your team member agreement gives you 70% of your deals.</p>
<ul>
  <li><strong>Broker gets 25%:</strong> $1,800 × 25% = <strong>$450</strong></li>
  <li><strong>You get 70%:</strong> $1,800 × 70% = <strong>$1,260</strong></li>
  <li><strong>Leader retains the spread:</strong> $1,800 - $450 - $1,260 = <strong>$90</strong></li>
</ul>

<h2>The Commission Preview Card</h2>
<p>When you enter GCI in the Add Transaction form, the green preview card will show you exactly how this breaks down in real-time. You will see the Broker cut, Your Split, and the Leader Retains amount clearly separated.</p>
    `,
  },

  // ── BACKFILL TEAM MEMBERSHIPS (ADMIN) ────────────────────────────────────────
  {
    id: 'admin-backfill-memberships',
    title: 'Admin: Backfill Team Memberships & Plans',
    description:
      'Learn what the Backfill tool does, why it exists, and when to use it to ensure team agent commissions calculate correctly.',
    category: 'Admin Tools',
    audience: 'staff',
    readingTimeMinutes: 3,
    publishedAt: '2026-05-23',
    content: `
<h2>What is the Backfill Tool?</h2>
<p>The <strong>Backfill Team Memberships &amp; Plans</strong> tool is an administrative utility located in <strong>Admin &rarr; Tools</strong>. Its purpose is to scan every agent in the brokerage who is assigned to a team and ensure they have the correct underlying data records required for commission calculations.</p>

<h2>Why Does It Exist?</h2>
<p>For commissions to calculate correctly—especially for tiered plans and team leader splits—the system relies on three interconnected records in the database:</p>
<ol>
  <li><strong>Agent Profile:</strong> The main record containing the agent's name, team assignment, and role.</li>
  <li><strong>Team Membership:</strong> A relational record linking the agent to their specific team.</li>
  <li><strong>Member Plan:</strong> A financial record detailing the agent's specific commission tiers or flat split.</li>
</ol>
<p>In the past, if an agent was added to a team but the membership and plan records were not manually created, their commissions would fail to calculate or throw errors (like "Profile not found"). The Backfill tool automatically detects any missing records and creates them based on the agent's profile settings.</p>

<h2>When Should I Use It?</h2>
<p>You should run the Backfill tool in the following scenarios:</p>
<ul>
  <li><strong>After a bulk import:</strong> If you import a list of new agents into the system.</li>
  <li><strong>If commissions aren't calculating:</strong> If an agent's transaction is throwing an error during staff approval.</li>
  <li><strong>Periodic maintenance:</strong> It is completely safe to run at any time to ensure data integrity.</li>
</ul>
<blockquote><strong>Note:</strong> The system now automatically creates these records whenever you save an agent profile. The Backfill tool is primarily for catching historical data gaps or fixing issues after bulk imports.</blockquote>

<h2>How to Use It</h2>
<ol>
  <li>Navigate to <strong>Admin &rarr; Tools</strong> in the sidebar.</li>
  <li>Scroll down to the <strong>Backfill Team Memberships &amp; Plans</strong> card.</li>
  <li>Click the <strong>Backfill Missing Memberships</strong> button.</li>
  <li>Wait for the process to complete. A summary alert will appear showing how many agents were processed, how many records were created, and how many were already correct.</li>
  <li>You can click <strong>View details</strong> to see a line-by-line breakdown of every agent processed.</li>
</ol>

<h2>Is It Safe?</h2>
<p><strong>Yes.</strong> The tool is strictly additive. It will <em>never</em> overwrite, delete, or modify an existing Team Membership or Member Plan. If an agent already has the correct records, the tool simply skips them and marks them as "already OK."</p>
    `,
  },

  // ── PDF UPLOAD & AUTO-FILL (AGENT) ─────────────────────────────────────────
  {
    id: 'agent-pdf-upload-autofill',
    title: 'Upload a Purchase Agreement to Auto-Fill Your Transaction',
    description:
      'How to use the document upload feature to instantly populate your Add Transaction form from a Louisiana LREC purchase agreement — including all dates, deadlines, and contact fields.',
    category: 'Transactions',
    audience: 'agent',
    readingTimeMinutes: 5,
    publishedAt: '2026-05-25',
    content: `
<h2>Overview</h2>
<p>When adding a new transaction, you can upload your signed Louisiana LREC purchase agreement (or counter offer) as a PDF and the system will automatically read the contract and fill in the form for you. This saves significant time and reduces the risk of manual data entry errors.</p>
<p>The feature uses AI (powered by OpenAI GPT-4o) to read the full text and images of your PDF — including custom-encoded fonts and signature pages — so it works reliably on Authentisign-executed documents.</p>

<h2>How to Use It</h2>
<ol>
  <li>Click <strong>Add Transaction</strong> in the sidebar.</li>
  <li>At the top of the form, find the <strong>Upload Purchase Agreement</strong> card.</li>
  <li>Click <strong>Choose File</strong> (or drag and drop) and select your signed PDF.</li>
  <li>Click <strong>Upload &amp; Auto-Fill</strong>. The system will process the document — this typically takes 10–20 seconds.</li>
  <li>Once complete, review the filled-in fields and make any corrections before submitting.</li>
</ol>
<blockquote><strong>Always review the auto-filled fields before submitting.</strong> While the system is highly accurate, you are responsible for confirming that all dates and contact information are correct.</blockquote>

<h2>What Gets Auto-Filled</h2>
<p>The system reads the entire contract and populates the following fields automatically:</p>
<table>
  <thead><tr><th>Section</th><th>Fields Populated</th></tr></thead>
  <tbody>
    <tr><td><strong>Property</strong></td><td>Property address, sale price</td></tr>
    <tr><td><strong>Dates</strong></td><td>Contract date (last signature date), projected close date, offer expiration date &amp; time</td></tr>
    <tr><td><strong>Calculated Deadlines</strong></td><td>Loan application deadline, inspection deadline, survey deadline, appraisal deadline, final loan commitment deadline, title deadline</td></tr>
    <tr><td><strong>Buyers</strong></td><td>Buyer 1 and Buyer 2 names</td></tr>
    <tr><td><strong>Sellers</strong></td><td>Seller 1 and Seller 2 names</td></tr>
    <tr><td><strong>Cooperating Agent</strong></td><td>Other agent name, brokerage, email, and phone</td></tr>
    <tr><td><strong>Financial Details</strong></td><td>Who is holding the deposit (Listing Broker, Selling Broker, or Other), commission paid by seller (%)</td></tr>
  </tbody>
</table>

<h2>How Deadlines Are Calculated</h2>
<p>All deadlines are calculated automatically using the standard Louisiana LREC rules. You do not need to count days manually.</p>
<table>
  <thead><tr><th>Deadline</th><th>How It Is Calculated</th></tr></thead>
  <tbody>
    <tr><td>Loan Application</td><td>Contract date + 5 calendar days (counting starts the day after the contract date)</td></tr>
    <tr><td>Inspection</td><td>Contract date + 7 calendar days</td></tr>
    <tr><td>Survey</td><td>Same as Inspection deadline</td></tr>
    <tr><td>Appraisal</td><td>Projected close date − 10 calendar days</td></tr>
    <tr><td>Final Loan Commitment</td><td>Projected close date − 5 calendar days</td></tr>
    <tr><td>Title</td><td>Projected close date − 3 calendar days</td></tr>
  </tbody>
</table>
<blockquote>The <strong>Contract Date</strong> is always the date of the <em>last</em> signature — whether that is the buyer's acceptance, the seller's acceptance, or the date a counter offer was signed. If a counter offer is present in the PDF, its terms and dates take precedence over the original offer.</blockquote>

<h2>Tips for Best Results</h2>
<ul>
  <li><strong>Upload the fully executed document.</strong> The system determines the contract date from the last signature. Uploading an unsigned or partially signed document will result in a missing or incorrect contract date.</li>
  <li><strong>Include counter offers.</strong> If a counter offer was signed, include it in the same PDF (or upload the combined executed document). Counter offer terms override the original offer.</li>
  <li><strong>PDF format only.</strong> The upload accepts PDF files only. If your document is in another format, convert it to PDF before uploading.</li>
  <li><strong>File size.</strong> The system handles standard-length LREC contracts (typically 10–15 pages) without issue.</li>
</ul>

<h2>What to Do If a Field Is Wrong or Missing</h2>
<p>The auto-fill is a starting point, not a final answer. If any field is blank or incorrect:</p>
<ul>
  <li>Simply type the correct value directly into the field — all fields are fully editable after the auto-fill runs.</li>
  <li>If a deadline is wrong, check that the contract date and projected close date were read correctly, as all deadlines are derived from those two anchor dates.</li>
  <li>If the cooperating agent information is missing, it may not have been present on the first page of the document. You can enter it manually in the <strong>Cooperating Agent</strong> section.</li>
</ul>
    `,
  },

  // ── TRANSACTION DRAFTS (AGENT) ───────────────────────────────────────────────
  {
    id: 'agent-transaction-drafts',
    title: 'Saving and Resuming Transaction Drafts',
    description:
      'How the auto-save draft system works so you never lose your progress when adding a new transaction.',
    category: 'Transactions',
    audience: 'agent',
    readingTimeMinutes: 3,
    publishedAt: '2026-05-25',
    content: `
<h2>Overview</h2>
<p>When you start filling out the <strong>Add Transaction</strong> form, the system automatically saves your progress as a draft every 30 seconds. If you get disconnected, close the browser tab, or simply need to step away and come back later, your work is never lost.</p>

<h2>Where Your Drafts Are Saved</h2>
<p>Drafts are saved securely to the cloud (Firestore) under your account — not just in your browser. This means you can start a transaction on your phone, close the app, and resume it later on your desktop exactly where you left off.</p>

<h2>Viewing Your Saved Drafts</h2>
<p>When you have one or more saved drafts, an <strong>amber "Saved Drafts" card</strong> will appear on your dashboard in the <strong>My Transactions</strong> section, just above the filters and transaction table. Each draft shows:</p>
<ul>
  <li>The property address (or client name if no address was entered yet)</li>
  <li>The sale price (if entered)</li>
  <li>How long ago the draft was last saved (e.g., "Saved 2 hours ago")</li>
</ul>

<h2>Resuming a Draft</h2>
<p>Click the <strong>Resume</strong> button on any draft row. The Add Transaction form will open with all your previously entered data pre-loaded — including any PDF auto-fill results, all contact fields, dates, and financial details.</p>

<h2>Deleting a Draft</h2>
<p>If you no longer need a draft (for example, the deal fell through before you submitted), click the <strong>trash icon</strong> on the draft row. The draft is permanently deleted from the cloud immediately.</p>
<blockquote>Drafts are also automatically deleted when you successfully submit a transaction, so your Saved Drafts list stays clean without any manual cleanup.</blockquote>

<h2>When Does Auto-Save Trigger?</h2>
<p>The auto-save runs every 30 seconds, but only if you have entered at least one of the following: a property address, a client name, or a sale price. A completely blank form will not create a draft.</p>

<h2>How Many Drafts Can I Have?</h2>
<p>There is no limit. You can have multiple drafts open at the same time — for example, if you are working several deals simultaneously and want to prep each one before submitting. Each draft is stored separately and identified by its address or client name.</p>
    `,
  },

  // ── PDF UPLOAD & AUTO-FILL (STAFF) ────────────────────────────────────────────
  {
    id: 'staff-pdf-upload-autofill',
    title: 'Staff Guide: How the PDF Auto-Fill Feature Works',
    description:
      'A technical overview of the purchase agreement upload and auto-fill system for staff and TCs — including what the AI reads, how dates are calculated, and how to troubleshoot common issues.',
    category: 'Transactions',
    audience: 'staff',
    readingTimeMinutes: 6,
    publishedAt: '2026-05-25',
    content: `
<h2>Overview</h2>
<p>The Smart Broker platform includes an AI-powered PDF extraction feature that allows agents to upload a signed Louisiana LREC purchase agreement and have the Add Transaction form populated automatically. This guide explains how the system works under the hood so that staff and TCs can assist agents, verify accuracy, and troubleshoot issues.</p>

<h2>How the System Works</h2>
<ol>
  <li>The agent uploads a PDF through the <strong>Upload Purchase Agreement</strong> card at the top of the Add Transaction form.</li>
  <li>The PDF is securely transmitted to the OpenAI Files API and processed by <strong>GPT-4o</strong>, which reads the full document including text, images, and signature pages.</li>
  <li>The AI extracts all relevant fields and calculates all deadlines using Louisiana LREC rules.</li>
  <li>The extracted data is returned to the form and populates the fields automatically.</li>
  <li>The uploaded file is immediately deleted from OpenAI's servers after extraction — it is never stored externally.</li>
</ol>
<blockquote>The system uses GPT-4o's native PDF reading capability, which means it can accurately read Authentisign-executed documents even when the underlying text uses custom or encoded fonts that would cause standard PDF text-extraction tools to produce garbled output.</blockquote>

<h2>Fields Extracted and Calculated</h2>
<table>
  <thead><tr><th>Field</th><th>Source in Contract</th></tr></thead>
  <tbody>
    <tr><td>Property address</td><td>Property description section</td></tr>
    <tr><td>Sale price</td><td>Purchase price clause</td></tr>
    <tr><td>Contract date</td><td>Date of the <em>last</em> signature (buyer, seller, or counter offer)</td></tr>
    <tr><td>Projected close date</td><td>Closing date clause</td></tr>
    <tr><td>Offer expiration date &amp; time</td><td>"Expiration of Offer" section</td></tr>
    <tr><td>Loan application deadline</td><td>Calculated: contract date + 5 calendar days</td></tr>
    <tr><td>Inspection deadline</td><td>Calculated: contract date + 7 calendar days</td></tr>
    <tr><td>Survey deadline</td><td>Same as inspection deadline</td></tr>
    <tr><td>Appraisal deadline</td><td>Calculated: projected close date − 10 calendar days</td></tr>
    <tr><td>Final loan commitment deadline</td><td>Calculated: projected close date − 5 calendar days</td></tr>
    <tr><td>Title deadline</td><td>Calculated: projected close date − 3 calendar days</td></tr>
    <tr><td>Buyer 1 &amp; Buyer 2 names</td><td>Buyers section</td></tr>
    <tr><td>Seller 1 &amp; Seller 2 names</td><td>Sellers section</td></tr>
    <tr><td>Cooperating agent name, brokerage, email, phone</td><td>Seller's Designated Agent block at top of document</td></tr>
    <tr><td>Deposit holder</td><td>Deposit section (Listing Broker, Selling Broker, or Other)</td></tr>
    <tr><td>Commission paid by seller (%)</td><td>Seller-paying-buyer's-broker clause</td></tr>
  </tbody>
</table>

<h2>Counter Offer Handling</h2>
<p>If the uploaded PDF contains a counter offer, the AI is instructed to treat the counter offer terms as the authoritative source. Any field modified by the counter offer (price, dates, terms) will reflect the counter offer value, not the original offer. The contract date will be set to the date the counter offer was signed — the date of the last signature on the entire document.</p>

<h2>Deadline Calculation Rules (Louisiana LREC)</h2>
<p>All deadlines are calculated using the standard Louisiana LREC counting convention: <strong>day counting begins the day after the contract date</strong> (i.e., the contract date itself is Day 0, and Day 1 is the following calendar day). No business-day adjustments are made — all counts use calendar days.</p>
<table>
  <thead><tr><th>Deadline</th><th>Formula</th><th>Example (Contract Date: May 26)</th></tr></thead>
  <tbody>
    <tr><td>Loan Application</td><td>Contract date + 5 days</td><td>May 31</td></tr>
    <tr><td>Inspection</td><td>Contract date + 7 days</td><td>June 2</td></tr>
    <tr><td>Survey</td><td>Same as Inspection</td><td>June 2</td></tr>
    <tr><td>Appraisal</td><td>Close date − 10 days</td><td>(depends on close date)</td></tr>
    <tr><td>Final Loan Commitment</td><td>Close date − 5 days</td><td>(depends on close date)</td></tr>
    <tr><td>Title</td><td>Close date − 3 days</td><td>(depends on close date)</td></tr>
  </tbody>
</table>

<h2>Troubleshooting Common Issues</h2>
<table>
  <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
  <tbody>
    <tr><td>Contract date is wrong or missing</td><td>The PDF is unsigned or only partially executed</td><td>Ask the agent to upload the fully executed document with all signatures</td></tr>
    <tr><td>Deadlines are off by one day</td><td>Agent manually adjusted the contract date after upload</td><td>Verify the contract date is correct; all deadlines recalculate from that anchor</td></tr>
    <tr><td>Cooperating agent fields are blank</td><td>The agent block was not on the first page of the document, or the agent is a buyer's agent with no co-agent listed</td><td>Enter the cooperating agent information manually</td></tr>
    <tr><td>Deposit holder shows "Other"</td><td>The contract names a specific title company or escrow agent rather than listing/selling broker</td><td>The "Other" text field will contain the name from the contract; verify it is correct</td></tr>
    <tr><td>Upload takes more than 30 seconds</td><td>Large file or slow connection</td><td>The system has a 60-second timeout; if it fails, ask the agent to try again or enter data manually</td></tr>
    <tr><td>Fields are blank after upload</td><td>The PDF may be a scanned image with no readable text layer</td><td>GPT-4o can read scanned images, but quality must be sufficient; try a higher-quality scan or enter data manually</td></tr>
  </tbody>
</table>

<h2>Privacy and Security</h2>
<ul>
  <li>The PDF is transmitted over an encrypted HTTPS connection.</li>
  <li>The file is uploaded to OpenAI's Files API with <code>purpose: user_data</code> and is automatically deleted from OpenAI's servers immediately after the extraction is complete.</li>
  <li>No contract data is stored by OpenAI beyond the duration of the single API call.</li>
  <li>The extracted field values are stored only in the agent's transaction draft in Firestore under their account.</li>
</ul>
    `,
  },

  // ── CO-AGENT TRANSACTIONS ────────────────────────────────────────────────────
  {
    id: 'co-agent-transactions',
    title: 'Co-Agent Transactions: How They Work',
    description:
      'Understand how co-agent commission splits are calculated, how both agents see the transaction, and what happens automatically at closing.',
    category: 'Transactions',
    audience: 'both',
    readingTimeMinutes: 5,
    publishedAt: '2026-05-23',
    content: `
<h2>What Is a Co-Agent Transaction?</h2>
<p>A co-agent transaction is any deal where two agents from the brokerage work the same side together and agree to split the commission. When submitting a transaction, the primary agent (the one who submits the form) can designate a co-agent and enter the percentage split — for example, 60% to the primary agent and 40% to the co-agent.</p>

<h2>How the Commission Split Is Calculated</h2>
<p>The system does <strong>not</strong> give both agents credit for the full sale price or the full gross commission. Instead, it divides everything proportionally before running any commission calculation:</p>
<table>
  <thead><tr><th>Metric</th><th>Primary Agent (60% example)</th><th>Co-Agent (40% example)</th></tr></thead>
  <tbody>
    <tr><td>Sale price credit</td><td>60% of sale price</td><td>40% of sale price</td></tr>
    <tr><td>Gross commission (GCI)</td><td>60% of total GCI</td><td>40% of total GCI</td></tr>
    <tr><td>Agent net commission</td><td>Calculated against their own plan &amp; tier</td><td>Calculated against their own plan &amp; tier</td></tr>
    <tr><td>Company dollar</td><td>Based on their own tier</td><td>Based on their own tier</td></tr>
    <tr><td>Leaderboard side credit</td><td>0.6 sides</td><td>0.4 sides</td></tr>
  </tbody>
</table>
<p>This means each agent's commission plan, tier, and anniversary-cycle progression are all calculated independently based on their own share — not the full deal amount. The total sides across both agents always adds up to 1.0, so leaderboard rankings remain accurate.</p>

<h2>Seeing the Transaction Before Closing</h2>
<p>From the moment the primary agent submits a transaction, <strong>both agents can see it</strong> in their My Transactions dashboard. The co-agent sees the same shared transaction record as the primary agent, so any edits made by the primary agent, TC, or staff are reflected for the co-agent automatically — in real time, with no manual sync required.</p>
<blockquote>The co-agent's view is <strong>read-only</strong> before closing. Only the primary agent, TC, and staff can edit the transaction. The co-agent can view all details and open any attached documents.</blockquote>
<p>Co-agent transactions are clearly labeled in the dashboard with a blue <strong>🤝 Co-Agent · [Primary Agent Name]</strong> badge so there is no confusion about which transactions are shared views versus personal submissions.</p>

<h2>What Happens at Closing</h2>
<p>When the transaction is marked <strong>Closed</strong>, the system automatically performs a split in the background:</p>
<ol>
  <li>Two brand-new, fully independent transaction records are created — one for the primary agent and one for the co-agent.</li>
  <li>Each record contains only that agent's proportional numbers (their share of the sale price, GCI, and compliance fee).</li>
  <li>Each agent's commission is recalculated against their own plan and tier using their individual share.</li>
  <li>The original shared transaction is deleted so there are no duplicates.</li>
  <li>Rollups and leaderboard stats are rebuilt for both agents immediately.</li>
  <li>Both agents receive a <strong>Transaction Closed &amp; Split</strong> notification showing their individual GCI and split percentage.</li>
</ol>
<p>After the split, each agent has their own fully editable closed transaction in their dashboard and in the admin transaction ledger — completely independent of the other agent.</p>

<h2>Summary: Co-Agent Transaction Lifecycle</h2>
<table>
  <thead><tr><th>Stage</th><th>Primary Agent</th><th>Co-Agent</th></tr></thead>
  <tbody>
    <tr><td>Submitted (pending TC review)</td><td>Sees it with ⏳ Pending TC Review badge</td><td>Sees it with 🤝 Co-Agent badge (read-only)</td></tr>
    <tr><td>TC approved (active / pending)</td><td>Full edit access</td><td>Read-only shared view</td></tr>
    <tr><td>Marked Closed</td><td>Split transaction auto-created with their numbers</td><td>Split transaction auto-created with their numbers</td></tr>
    <tr><td>After closing</td><td>Own independent closed transaction</td><td>Own independent closed transaction</td></tr>
  </tbody>
</table>
    `,
  },

  // ── COMMISSION CALCULATION ──────────────────────────────────────────────────
  {
    id: 'commission-calculation-process',
    title: 'Commission Calculation: The Complete Process',
    description:
      'Understand exactly how commissions are calculated — including referral fee deductions, co-agent splits, compliance fees, and the correct order of operations. Updated July 2026.',
    category: 'Team & Commission',
    audience: 'both',
    readingTimeMinutes: 8,
    publishedAt: '2026-07-28',
    content: `
<h2>Overview</h2>
<p>Every commission calculation in Smart Broker follows a strict order of operations. The sequence matters — applying steps out of order produces incorrect results. This guide explains each step, with worked examples, so agents and staff can verify calculations and enter transactions accurately.</p>

<h2>The Order of Operations</h2>
<p>Regardless of who enters the transaction (agent, TC, or admin), the system always calculates commissions in this exact sequence:</p>
<ol>
  <li><strong>Gross Commission Income (GCI)</strong> — Total commission before any deductions</li>
  <li><strong>Deduct Outbound Referral Fee off the top</strong> (if any)</li>
  <li><strong>Split the remaining net between Primary Agent and Co-Agent</strong> (if any)</li>
  <li><strong>Apply each agent's broker/agent split tier</strong> to their individual share</li>
  <li><strong>Deduct agent-paid compliance fee</strong> from agent net (if applicable)</li>
</ol>

<h2>Step 1 — Gross Commission Income (GCI)</h2>
<p>GCI is the total commission earned on the transaction before any deductions. It is calculated as:</p>
<blockquote>GCI = Commission Base Price × Commission Percentage</blockquote>
<p>The <strong>Commission Base Price</strong> is the sale price minus any seller concessions (if populated). If no concessions are entered, the sale price is used directly. The list price is used for active listings before a sale price is known.</p>
<p><strong>Example:</strong> Sale price $500,000, 3% commission, no concessions → GCI = <strong>$15,000</strong></p>

<h2>Step 2 — Outbound Referral Fee Deduction</h2>
<p>If the transaction includes an outbound referral fee (paid to an outside broker, relocation company, or referring agent), that fee is <strong>deducted from GCI first</strong>, before any agent or broker splits are calculated.</p>
<blockquote>Net After Referral = GCI − Referral Fee Dollar Amount</blockquote>
<p>All subsequent calculations — agent split, broker split, co-agent split — are based on the <strong>Net After Referral</strong>, not the original GCI. This is the most important rule in this guide.</p>
<table>
  <thead><tr><th>Scenario</th><th>GCI</th><th>Referral %</th><th>Referral $</th><th>Net After Referral</th></tr></thead>
  <tbody>
    <tr><td>No referral</td><td>$15,000</td><td>0%</td><td>$0</td><td>$15,000</td></tr>
    <tr><td>25% referral to KW</td><td>$15,000</td><td>25%</td><td>$3,750</td><td><strong>$11,250</strong></td></tr>
    <tr><td>30% relocation referral</td><td>$15,000</td><td>30%</td><td>$4,500</td><td><strong>$10,500</strong></td></tr>
    <tr><td>40% referral (dollar override)</td><td>$15,000</td><td>—</td><td>$6,000</td><td><strong>$9,000</strong></td></tr>
  </tbody>
</table>
<p><strong>Common mistake to avoid:</strong> Do not enter a reduced GCI to account for the referral. Enter the full GCI and use the Outbound Referral Fee field. The system deducts it automatically.</p>

<h2>Step 3 — Co-Agent Split</h2>
<p>If the transaction has a co-listing agent or co-buyer agent, the <strong>Net After Referral</strong> (not the original GCI) is split between the primary agent and the co-agent according to the agreed percentages. The split percentages must total 100%.</p>
<blockquote>
  Primary Agent Share = Net After Referral × Primary Split %<br/>
  Co-Agent Share = Net After Referral × Co-Agent Split %
</blockquote>
<p><strong>Example:</strong> GCI = $15,000, 25% referral to KW, 60/40 co-listing split</p>
<table>
  <thead><tr><th>Item</th><th>Calculation</th><th>Amount</th></tr></thead>
  <tbody>
    <tr><td>GCI</td><td>—</td><td>$15,000</td></tr>
    <tr><td>Referral fee (25%)</td><td>$15,000 × 25%</td><td>−$3,750</td></tr>
    <tr><td><strong>Net After Referral</strong></td><td>—</td><td><strong>$11,250</strong></td></tr>
    <tr><td>Primary agent share (60%)</td><td>$11,250 × 60%</td><td><strong>$6,750</strong></td></tr>
    <tr><td>Co-agent share (40%)</td><td>$11,250 × 40%</td><td><strong>$4,500</strong></td></tr>
  </tbody>
</table>

<h2>Step 4 — Broker/Agent Split Tier</h2>
<p>Each agent's commission tier is applied to their individual share of the net-after-referral GCI. The tier is determined by the agent's commission profile and their year-to-date production.</p>
<blockquote>
  Agent Gross = Agent Share × Agent Split %<br/>
  Broker Retained = Agent Share × Broker Split %
</blockquote>
<p><strong>Example (continuing from above):</strong> Primary agent is on a 70/30 split tier.</p>
<table>
  <thead><tr><th>Item</th><th>Calculation</th><th>Amount</th></tr></thead>
  <tbody>
    <tr><td>Primary agent share</td><td>—</td><td>$6,750</td></tr>
    <tr><td>Agent gross (70%)</td><td>$6,750 × 70%</td><td>$4,725</td></tr>
    <tr><td>Broker retained (30%)</td><td>$6,750 × 30%</td><td>$2,025</td></tr>
  </tbody>
</table>

<h2>Step 5 — Agent-Paid Compliance Fee</h2>
<p>If the transaction has a compliance/transaction fee and the agent has selected <strong>"Agent Pays"</strong>, the fee is subtracted from the agent's gross to arrive at the final Agent Net. This deduction does not affect GCI, tier lookup, or broker retained.</p>
<blockquote>Agent Net = Agent Gross − Compliance Fee</blockquote>

<h2>Complete Worked Example</h2>
<p>Transaction: $500,000 sale, 3% commission, 25% referral to Keller Williams, co-listing 60/40 split, $150 compliance fee paid by primary agent. Primary agent on 70/30 tier, co-agent on 75/25 tier.</p>
<table>
  <thead><tr><th>Step</th><th>Item</th><th>Calculation</th><th>Amount</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>GCI</td><td>$500,000 × 3%</td><td>$15,000</td></tr>
    <tr><td>2</td><td>Referral fee to KW (25%)</td><td>$15,000 × 25%</td><td>−$3,750</td></tr>
    <tr><td>2</td><td><strong>Net After Referral</strong></td><td>$15,000 − $3,750</td><td><strong>$11,250</strong></td></tr>
    <tr><td>3</td><td>Primary agent share (60%)</td><td>$11,250 × 60%</td><td>$6,750</td></tr>
    <tr><td>3</td><td>Co-agent share (40%)</td><td>$11,250 × 40%</td><td>$4,500</td></tr>
    <tr><td>4</td><td>Primary: agent gross (70%)</td><td>$6,750 × 70%</td><td>$4,725</td></tr>
    <tr><td>4</td><td>Primary: broker retained (30%)</td><td>$6,750 × 30%</td><td>$2,025</td></tr>
    <tr><td>4</td><td>Co-agent: agent gross (75%)</td><td>$4,500 × 75%</td><td>$3,375</td></tr>
    <tr><td>4</td><td>Co-agent: broker retained (25%)</td><td>$4,500 × 25%</td><td>$1,125</td></tr>
    <tr><td>5</td><td>Primary: compliance fee</td><td>—</td><td>−$150</td></tr>
    <tr><td><strong>Final</strong></td><td><strong>Primary agent net</strong></td><td>$4,725 − $150</td><td><strong>$4,575</strong></td></tr>
    <tr><td><strong>Final</strong></td><td><strong>Co-agent net</strong></td><td>—</td><td><strong>$3,375</strong></td></tr>
    <tr><td><strong>Final</strong></td><td><strong>Total broker retained</strong></td><td>$2,025 + $1,125</td><td><strong>$3,150</strong></td></tr>
    <tr><td><strong>Final</strong></td><td><strong>KW referral</strong></td><td>—</td><td><strong>$3,750</strong></td></tr>
    <tr><td><strong>Check</strong></td><td>Total accounted for</td><td>$4,575 + $3,375 + $3,150 + $3,750 + $150</td><td><strong>$15,000 ✓</strong></td></tr>
  </tbody>
</table>

<h2>How to Enter a Referral Fee</h2>
<ol>
  <li>Open the <strong>Add Listing</strong> or <strong>Add Transaction</strong> form.</li>
  <li>Scroll to the <strong>Outbound Referral Fee</strong> section (below the Co-Agent section).</li>
  <li>Toggle the referral fee switch to <strong>On</strong>.</li>
  <li>Enter the referring broker/company name and the referral percentage (e.g., 25%).</li>
  <li>The system automatically calculates the dollar amount and adjusts all commission fields.</li>
  <li>The Live Split Preview will show an orange warning banner confirming the referral deduction and the net base used for splits.</li>
</ol>
<p>If the referral fee was not entered at the time of submission, it can be added or adjusted later by an admin through the Edit Transaction form. The system will automatically recalculate all commission fields when the referral fee is changed.</p>

<h2>How to Enter a Co-Agent</h2>
<ol>
  <li>In the <strong>Add Listing</strong> or <strong>Add Transaction</strong> form, scroll to the <strong>Co-Agent</strong> section.</li>
  <li>Toggle the co-agent switch to <strong>On</strong>.</li>
  <li>Search for the co-agent by name and select them from the roster.</li>
  <li>Enter the split percentages (must total 100%).</li>
  <li>The Live Split Preview will update to show each agent's GCI share based on the post-referral net.</li>
</ol>

<h2>Quick Reference</h2>
<table>
  <thead><tr><th>Situation</th><th>What to do</th><th>What NOT to do</th></tr></thead>
  <tbody>
    <tr><td>Transaction with a referral fee</td><td>Enter full GCI + referral % in Outbound Referral Fee field</td><td>Do not manually reduce GCI to account for the referral</td></tr>
    <tr><td>Co-listing with a referral</td><td>Enter both co-agent split AND referral fee; system handles the order</td><td>Do not calculate each agent's share manually before entering</td></tr>
    <tr><td>Agent pays compliance fee</td><td>Select "Agent Pays" in the compliance fee section</td><td>Do not subtract the fee from the commission % or GCI</td></tr>
    <tr><td>Referral fee added after submission</td><td>Admin edits the transaction and adds/changes the referral fee</td><td>The system recalculates automatically; no manual adjustment needed</td></tr>
  </tbody>
</table>
    `,
  },

  // ── DOCUMENT MANAGEMENT ────────────────────────────────────────────────────
  {
    id: 'document-management',
    title: 'Document Management: Uploading, Archiving & Restoring',
    description:
      'How to upload documents to a transaction, why you archive instead of delete, and how to restore archived files when needed.',
    category: 'Transactions',
    audience: 'both',
    readingTimeMinutes: 4,
    publishedAt: '2026-08-03',
    content: `
<h2>Overview</h2>
<p>Every transaction in Smart Broker has a dedicated <strong>Documents</strong> section where agents, staff, and TCs can upload, view, and manage files related to that deal. The system is designed to maintain a complete, tamper-proof compliance record — which means documents are never permanently deleted. Instead, they are <strong>archived</strong>.</p>

<h2>Uploading Documents</h2>
<p>You can upload documents at any point in the transaction lifecycle — when you first submit the listing, after it goes under contract, or at closing. There is no limit on the number of files you can attach to a single transaction.</p>
<ol>
  <li>Open the transaction from your <strong>My Transactions</strong> dashboard (agents) or the <strong>Transaction Ledger</strong> (staff/admin).</li>
  <li>Scroll to the <strong>Documents</strong> section.</li>
  <li>Click <strong>Upload Document</strong> and select the file from your device.</li>
  <li>The system will automatically name the document based on its title or header where possible. You can rename it manually if needed.</li>
  <li>The uploaded file is immediately visible to all parties with access to that transaction (agent, staff, and TC if assigned).</li>
</ol>
<blockquote><strong>Tip:</strong> If you upload a Purchase Agreement to start a transaction, the system will automatically save it as a document in the file — no need to re-upload it later.</blockquote>

<h2>Why You Archive Instead of Delete</h2>
<p>Agents and staff cannot permanently delete documents from a transaction. This is intentional. Real estate transactions are subject to brokerage compliance and record-keeping requirements, and permanently removing a document could create a gap in the audit trail. Instead, the system uses an <strong>Archive</strong> action that hides the document from the main view without destroying it.</p>
<p>Common reasons to archive a document:</p>
<ul>
  <li>You uploaded the wrong version of a contract and replaced it with the correct one.</li>
  <li>A first offer fell through and you want to keep the file clean for the executed contract.</li>
  <li>A document was uploaded to the wrong transaction by mistake.</li>
</ul>

<h2>How to Archive a Document</h2>
<ol>
  <li>Open the transaction and scroll to the <strong>Documents</strong> section.</li>
  <li>Find the document you want to hide.</li>
  <li>Click the <strong>Archive</strong> button (or the archive icon) next to the document.</li>
  <li>The document disappears from the main Documents view and moves to the <strong>Archived</strong> tab.</li>
</ol>
<p>Archived documents are still stored in the system and are visible to admins and staff in the Archived tab. They do not appear in the active document list shown to agents or TCs by default.</p>

<h2>How to Restore an Archived Document</h2>
<p>If you archived a document by mistake or need to reference it again, you can restore it at any time.</p>
<ol>
  <li>Open the transaction and scroll to the <strong>Documents</strong> section.</li>
  <li>Click the <strong>Archived</strong> tab to view hidden documents.</li>
  <li>Find the document and click <strong>Restore</strong>.</li>
  <li>The document moves back to the active Documents list and is visible to all parties again.</li>
</ol>

<h2>Quick Reference</h2>
<table>
  <thead><tr><th>Action</th><th>Who Can Do It</th><th>What It Does</th></tr></thead>
  <tbody>
    <tr><td>Upload</td><td>Agent, Staff, TC</td><td>Adds a file to the transaction. Visible to all parties immediately.</td></tr>
    <tr><td>Archive</td><td>Agent, Staff, TC</td><td>Hides the file from the main view. File is preserved in the Archived tab.</td></tr>
    <tr><td>Restore</td><td>Agent, Staff, TC</td><td>Moves an archived file back to the active Documents list.</td></tr>
    <tr><td>Delete (permanent)</td><td>Nobody</td><td>Not available. Documents cannot be permanently removed.</td></tr>
  </tbody>
</table>
    `,
  },

  // ── SCHEDULING STATUS BADGES ─────────────────────────────────────────────────
  {
    id: 'scheduling-status-badges',
    title: 'Scheduling Status Badges Explained',
    description:
      'Understand the three scheduling status badges used for Staging, Inspections, ShowingTime, and Media — and how they prevent duplicate work between agents, staff, and TCs.',
    category: 'Transactions',
    audience: 'both',
    readingTimeMinutes: 3,
    publishedAt: '2026-08-03',
    content: `
<h2>Overview</h2>
<p>Several sections of a transaction — Staging Consult, Pre-Listing Inspection, Buyer Inspection, ShowingTime, and Media — include a <strong>scheduling status badge</strong>. These badges exist to prevent duplicate work. Without them, an agent might schedule something themselves while staff is also trying to schedule it, resulting in confusion and double-bookings.</p>
<p>The badge tells everyone involved exactly who is handling the scheduling — and whether anything needs to be done at all.</p>

<h2>The Three Badge States</h2>
<table>
  <thead><tr><th>Badge</th><th>What It Means</th><th>What Staff / TC Should Do</th></tr></thead>
  <tbody>
    <tr>
      <td><strong>TC / Staff to Schedule</strong></td>
      <td>The agent has left the date/time blank and is requesting that staff or the TC handle the scheduling on their behalf.</td>
      <td>Take action — contact the vendor or service provider and schedule the appointment. Update the date/time field once confirmed.</td>
    </tr>
    <tr>
      <td><strong>Already Scheduled</strong></td>
      <td>The agent has already scheduled the appointment and is logging the confirmed date/time for the file record.</td>
      <td>No action needed — the appointment is handled. Just verify the date looks correct.</td>
    </tr>
    <tr>
      <td><strong>Request Sent</strong></td>
      <td>The agent clicked a link or button to initiate the request directly with the vendor (e.g., clicked the Staging Consult link). The system sets this badge automatically.</td>
      <td>No action needed — the agent has already reached out. Monitor for confirmation if needed.</td>
    </tr>
  </tbody>
</table>

<h2>How the Badge Gets Set</h2>
<p>The badge is controlled by what the agent does in the transaction form:</p>
<ul>
  <li>If the agent <strong>leaves the date/time blank</strong> and does not click any request link, the badge defaults to <strong>TC / Staff to Schedule</strong>.</li>
  <li>If the agent <strong>enters a confirmed date and time</strong>, the badge updates to <strong>Already Scheduled</strong>.</li>
  <li>If the agent <strong>clicks the vendor request link</strong> (e.g., the Staging Consult order link), the system automatically sets the badge to <strong>Request Sent</strong>.</li>
</ul>

<h2>Where You See These Badges</h2>
<p>The scheduling status badge appears in the same location across all three views of a transaction:</p>
<ul>
  <li><strong>Agent Ledger</strong> — so the agent can see what they requested and confirm it was received.</li>
  <li><strong>Staff Queue</strong> — so staff knows exactly what action is needed from them.</li>
  <li><strong>TC Queue</strong> — so the TC can coordinate without duplicating what staff is already doing.</li>
</ul>
<blockquote>The badge is a communication tool. When in doubt, check the badge before reaching out to the agent — the answer is usually already there.</blockquote>

<h2>Staging Consult: Special Case</h2>
<p>The Staging Consult section works slightly differently from other scheduling sections. When an agent clicks the <strong>Order Staging Consult</strong> link inside the transaction, two things happen simultaneously:</p>
<ol>
  <li>The agent is taken to the staging vendor’s booking page.</li>
  <li>The badge on the transaction automatically updates to <strong>Request Sent</strong>.</li>
</ol>
<p>This means staff and TCs will immediately see that the agent handled it themselves, without needing to ask.</p>
    `,
  },

  // ── COMING SOON LISTINGS ────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'coming-soon-listings',
    title: 'Coming Soon Listings: How They Work',
    description:
      'Understand the Coming Soon status — what it does, how the 30-day auto-activate rule works, and what staff needs to do when a listing is submitted as Coming Soon.',
    category: 'Transactions',
    audience: 'both',
    readingTimeMinutes: 4,
    publishedAt: '2026-08-03',
    content: `
<h2>What Is a Coming Soon Listing?</h2>
<p>The <strong>Coming Soon</strong> status is designed for listings that are not yet ready to go fully Active on the MLS but need to be entered into the system. It is identical to the Active status in terms of commission calculations and pipeline tracking — the only difference is the MLS entry instruction and the 30-day auto-activate rule.</p>
<p>Agents sometimes wonder why their listing shows as Coming Soon in Smart Broker instead of Active. The answer is simple: <strong>Coming Soon in Smart Broker = Coming Soon in the MLS.</strong> When you submit a listing as Coming Soon, staff is instructed to add it to the MLS as Coming Soon, not Active. When you are ready to go Active, simply change the status in your dashboard and staff will update the MLS accordingly.</p>

<h2>How to Submit a Coming Soon Listing</h2>
<ol>
  <li>Click <strong>Add Transaction</strong> in the sidebar.</li>
  <li>Select <strong>Coming Soon</strong> from the Status dropdown.</li>
  <li>Fill in the required fields: Property Address, Closing Type, and Client Name.</li>
  <li>Complete any optional fields (List Price, Sign Order, ShowingTime, Media) as needed.</li>
  <li>Click <strong>Submit</strong>.</li>
</ol>
<p>The system will automatically notify staff to add the listing to the MLS as Coming Soon and will generate a Coming Soon-specific checklist in the Staff Queue.</p>

<h2>The 30-Day Auto-Activate Rule</h2>
<p>MLS rules limit Coming Soon status to a maximum of 30 days. To enforce this automatically, the Smart Broker platform runs a daily background job that checks all Coming Soon listings. If a listing has been in Coming Soon status for <strong>30 days or more</strong> (measured from the Listing Date), the system will automatically transition it to <strong>Active</strong>.</p>
<table>
  <thead><tr><th>Event</th><th>Who Gets Notified</th><th>What the Notification Says</th></tr></thead>
  <tbody>
    <tr><td>New Coming Soon listing submitted</td><td>Staff</td><td>"Add to MLS as Coming Soon status. Auto-activates in 30 days if not changed."</td></tr>
    <tr><td>Coming Soon → Pending (manual)</td><td>Staff &amp; TC (if assigned)</td><td>"Coming Soon listing is now Pending. Please update MLS."</td></tr>
    <tr><td>Auto-activate fires (30 days reached)</td><td>Staff, Agent, TC (if assigned)</td><td>Staff: "Update MLS to Active." Agent: "Your Coming Soon listing has automatically gone Active."</td></tr>
  </tbody>
</table>
<blockquote><strong>Staff tip:</strong> The Coming Soon checklist includes a reminder item — “Note: listing auto-activates after 30 days — confirm with agent before deadline.” Check in with the agent around day 25 to confirm whether they want to manually activate, extend (if MLS rules allow), or cancel before the auto-activate fires.</blockquote>

<h2>Allowed Status Transitions</h2>
<p>A Coming Soon listing can be manually moved to any of the following statuses at any time — there is no requirement to go through Active first:</p>
<table>
  <thead><tr><th>From</th><th>To</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td>Coming Soon</td><td>Active</td><td>Standard activation — staff should update MLS to Active.</td></tr>
    <tr><td>Coming Soon</td><td>Pending</td><td>Property went under contract while still in Coming Soon — staff should update MLS to Pending.</td></tr>
    <tr><td>Coming Soon</td><td>Temp Off Market</td><td>Listing is being pulled temporarily.</td></tr>
    <tr><td>Coming Soon</td><td>Canceled</td><td>Listing is being withdrawn entirely.</td></tr>
  </tbody>
</table>

<h2>Commission Display While Coming Soon</h2>
<p>While a listing is in Coming Soon status, the agent dashboard displays an <strong>estimated commission</strong> based on the List Price and the agent’s current commission plan split — exactly the same as an Active listing. The badge shows “Estimated” to indicate this is a projection, not a finalized number. Once the listing goes Pending, the system switches to the actual Sale Price.</p>

<h2>Quick Reference for Staff</h2>
<table>
  <thead><tr><th>Task</th><th>Action</th></tr></thead>
  <tbody>
    <tr><td>New Coming Soon listing in queue</td><td>Add to MLS as Coming Soon. Log MLS# in Staff Notes. Mark Complete.</td></tr>
    <tr><td>Coming Soon → Active (manual or auto)</td><td>Update MLS status to Active. Log in Staff Notes.</td></tr>
    <tr><td>Coming Soon → Pending</td><td>Update MLS to Pending. Enter contract details. Log in Staff Notes.</td></tr>
    <tr><td>Approaching 30-day deadline</td><td>Contact agent to confirm intent before auto-activate fires.</td></tr>
  </tbody>
</table>
    `,
  },

  // ── TC & STAFF NOTIFICATION SYSTEM ────────────────────────────────────────────────
  {
    id: 'tc-staff-notification-system',
    title: 'TC & Staff Notification System: How It Works',
    description:
      'A complete guide to how TC coordinators and staff are notified of transaction events, queue actions, status changes, document uploads, and field updates.',
    category: 'Admin Tools',
    audience: 'staff',
    readingTimeMinutes: 6,
    publishedAt: '2026-08-04',
    content: `
<h2>Overview</h2>
<p>The Smart Broker platform automatically notifies both TC coordinators and staff whenever something meaningful happens on a transaction. Notifications appear in the bell icon in the top-right corner of the dashboard. The bell badge shows a count of unread notifications and plays a chime when new ones arrive.</p>

<blockquote>
  <strong>Key principle:</strong> Staff are notified on <em>every</em> transaction event, no exceptions. TC coordinators are notified on transactions they are actively managing — either because the agent checked &ldquo;Working with TC&rdquo; at submission, or because a TC has already approved an intake for that transaction.
</blockquote>

<h2>What Triggers a Notification</h2>

<h3>When an Agent Makes a Change</h3>
<table>
  <thead><tr><th>Event</th><th>Staff Notified</th><th>TC Notified</th></tr></thead>
  <tbody>
    <tr><td>New listing submitted</td><td>Yes — always</td><td>Yes — if agent checked &ldquo;Working with TC&rdquo;</td></tr>
    <tr><td>Status change (any)</td><td>Yes — always</td><td>Yes — if TC-managed (see below)</td></tr>
    <tr><td>Document uploaded</td><td>Yes — always</td><td>Yes — if TC-managed</td></tr>
    <tr><td>Key field updated (price, dates, client, lender, title, etc.)</td><td>Yes — always</td><td>Yes — if TC-managed</td></tr>
    <tr><td>Transaction resubmitted to TC</td><td>Yes — always</td><td>Yes — always</td></tr>
  </tbody>
</table>

<h3>When TC Takes Action in the TC Queue</h3>
<table>
  <thead><tr><th>Event</th><th>Agent Notified</th><th>Staff Notified</th></tr></thead>
  <tbody>
    <tr><td>TC changes intake status (In Review, Approved, Rejected)</td><td>Yes</td><td>Yes</td></tr>
    <tr><td>TC completes a checklist task</td><td>Yes</td><td>Yes</td></tr>
    <tr><td>TC rejects an intake</td><td>Yes — with rejection reason</td><td>Yes</td></tr>
  </tbody>
</table>

<h3>When Staff Takes Action in the Staff Queue</h3>
<table>
  <thead><tr><th>Event</th><th>Agent Notified</th><th>TC Notified</th></tr></thead>
  <tbody>
    <tr><td>Staff starts review</td><td>Yes</td><td>Yes</td></tr>
    <tr><td>Staff completes review</td><td>Yes</td><td>Yes</td></tr>
    <tr><td>Staff dismisses item</td><td>Yes</td><td>Yes</td></tr>
    <tr><td>Staff saves or updates transaction fields</td><td>Yes</td><td>Yes</td></tr>
    <tr><td>Staff completes a checklist task</td><td>Yes</td><td>Yes</td></tr>
    <tr><td>Staff logs an activity note</td><td>Yes</td><td>Yes</td></tr>
  </tbody>
</table>

<h2>What &ldquo;TC-Managed&rdquo; Means</h2>
<p>A transaction is considered TC-managed — and the TC will receive notifications for it — when either of the following is true:</p>
<ul>
  <li>The agent checked <strong>&ldquo;Working with TC&rdquo;</strong> when submitting the transaction, or</li>
  <li>A TC coordinator has already <strong>approved a TC intake</strong> linked to that transaction</li>
</ul>
<p>This means that even if an agent forgot to check the TC box at submission, once the TC has approved the file, they will automatically receive all future notifications for that transaction — status changes, document uploads, and field edits — without any manual re-linking required.</p>

<h2>How the Notification Bell Works</h2>
<ul>
  <li>The bell badge count updates automatically every <strong>60 seconds</strong> in the background</li>
  <li>When you open the bell dropdown, it always fetches fresh data (if more than 30 seconds have passed since the last fetch)</li>
  <li>Clicking a notification marks it as read and navigates you directly to the relevant queue or transaction</li>
  <li>TC notifications link to the <strong>TC Queue</strong></li>
  <li>Staff notifications link to the <strong>Staff Queue</strong></li>
  <li>Agent notifications link to their <strong>Transaction Ledger</strong></li>
</ul>

<h2>Deduplication</h2>
<p>If a staff member also holds a TC role (e.g., <code>tc_admin</code>), they will receive only <strong>one</strong> notification per event — not two. The system automatically excludes TC UIDs that are already covered by the staff notification to prevent duplicate delivery.</p>

<h2>Troubleshooting: Not Seeing Notifications</h2>
<table>
  <thead><tr><th>Symptom</th><th>Likely Cause</th><th>Fix</th></tr></thead>
  <tbody>
    <tr><td>Bell shows zero / &ldquo;You&rsquo;re all caught up&rdquo;</td><td>Browser has cached old JavaScript</td><td>Hard refresh: Mac Cmd+Shift+R &mdash; Windows Ctrl+Shift+R</td></tr>
    <tr><td>Bell count not updating</td><td>Polling hasn&rsquo;t fired yet</td><td>Wait up to 60 seconds, or open and close the bell to force a fresh fetch</td></tr>
    <tr><td>TC not notified on a specific transaction</td><td>No TC intake approved and &ldquo;Working with TC&rdquo; was not checked</td><td>Agent should resubmit to TC, or check the &ldquo;Working with TC&rdquo; box on the transaction</td></tr>
    <tr><td>Notification link goes to wrong page</td><td>Old cached notification from before a system update</td><td>Mark old notifications as read; new ones will have correct links</td></tr>
  </tbody>
</table>

<h2>Quick Reference: Who Gets Notified for What</h2>
<table>
  <thead><tr><th>Action</th><th>Agent</th><th>Staff</th><th>TC</th></tr></thead>
  <tbody>
    <tr><td>New listing submitted</td><td>&mdash;</td><td>&#10003;</td><td>&#10003; if TC flag</td></tr>
    <tr><td>Status change</td><td>&#10003;</td><td>&#10003;</td><td>&#10003; if TC-managed</td></tr>
    <tr><td>Document uploaded</td><td>&mdash;</td><td>&#10003;</td><td>&#10003; if TC-managed</td></tr>
    <tr><td>Field updated</td><td>&mdash;</td><td>&#10003;</td><td>&#10003; if TC-managed</td></tr>
    <tr><td>TC updates intake status</td><td>&#10003;</td><td>&#10003;</td><td>&mdash;</td></tr>
    <tr><td>TC completes checklist</td><td>&#10003;</td><td>&#10003;</td><td>&mdash;</td></tr>
    <tr><td>Staff completes review</td><td>&#10003;</td><td>&mdash;</td><td>&#10003;</td></tr>
    <tr><td>Staff updates checklist</td><td>&#10003;</td><td>&mdash;</td><td>&#10003;</td></tr>
    <tr><td>Staff saves field changes</td><td>&#10003;</td><td>&mdash;</td><td>&#10003;</td></tr>
  </tbody>
</table>
    `,
  },
  // ── COMMISSION CALCULATION RULES ─────────────────────────────────────────────
  {
    id: 'commission-calculation-rules',
    title: 'Commission Calculation: Fees, Shortage & Closing Cost Pool',
    description:
      'How the transaction compliance fee, shortage in commission, and home warranty are calculated — including who pays, when it affects GCI, and how the seller-paid closing cost pool works.',
    category: 'Team & Commission',
    audience: 'both',
    readingTimeMinutes: 8,
    publishedAt: '2026-08-09',
    content: `
<h2>Overview</h2>
<p>When entering a buyer transaction in Smart Broker USA, three items can affect the final commission split: the <strong>Shortage in Commission</strong>, the <strong>Transaction Compliance Fee ($395)</strong>, and the <strong>Home Warranty</strong>. The financial impact of each item depends entirely on <em>who is paying for it</em>. This guide explains the exact rules for each scenario.</p>

<h2>Payment Options and Their Financial Effect</h2>
<p>Each item has multiple payment options. The table below shows the exact effect on Gross Commission Income (GCI), the seller-paid closing cost pool, and the agent's take-home pay.</p>

<table>
  <thead>
    <tr>
      <th>Who Pays?</th>
      <th>Adds to GCI?</th>
      <th>Subtracts from Closing Cost Pool?</th>
      <th>Deducted from Agent Take-Home?</th>
    </tr>
  </thead>
  <tbody>
    <tr><td><strong>Agent Absorbed</strong></td><td>No*</td><td>No</td><td>Depends on item (see below)</td></tr>
    <tr><td><strong>Buyer Pays Directly</strong></td><td>Yes</td><td>No</td><td>No</td></tr>
    <tr><td><strong>Seller Pays Directly</strong> (Warranty only)</td><td>No</td><td>No</td><td>No</td></tr>
    <tr><td><strong>Seller Pays from Closing Cost</strong></td><td>Yes</td><td>Yes</td><td>No</td></tr>
  </tbody>
</table>

<h2>The Three Items — Exact Rules When Agent Absorbs</h2>

<h3>1. Shortage in Commission (Agent Absorbs)</h3>
<p>When the agent absorbs the shortage, it is treated as a <strong>write-off</strong>. The commission is simply short and nobody pays the difference. There is no effect on the GCI and no deduction from the agent's take-home pay.</p>
<blockquote>Example: GCI is $6,000. Agent absorbs a $300 shortage. GCI stays $6,000. Agent take-home is unchanged.</blockquote>

<h3>2. Transaction Compliance Fee — $395 (Agent Pays)</h3>
<p>When the agent pays the $395 fee, it is treated as a <strong>post-split deduction</strong>. The split is calculated on the full GCI first, and then the $395 is deducted from the agent's net at the end.</p>
<blockquote>Example: GCI is $6,000. Agent split is 70% = $4,200. Then $395 is deducted. Agent take-home = $3,805.</blockquote>

<h3>3. Home Warranty (Agent Pays)</h3>
<p>When the agent pays the home warranty, it is treated as a <strong>pre-split reduction</strong>. The warranty cost is deducted from the GCI <em>before</em> the split is calculated. This means the agent's split percentage is applied to a lower base amount.</p>
<blockquote>Example: GCI is $6,000. Agent pays $500 warranty. GCI is reduced to $5,500 before the split. Agent split is 70% of $5,500 = $3,850 (not $4,200).</blockquote>

<h2>The Seller-Paid Closing Cost Pool</h2>
<p>When the seller agrees to pay a lump sum toward the buyer's closing costs (e.g., $5,000), that amount forms a <strong>closing cost pool</strong>. Any of the three items above can be paid from this pool. The system automatically calculates what remains for the buyer's actual closing costs.</p>

<h3>How the Pool Works</h3>
<ul>
  <li>Items paid from the pool are <strong>subtracted from the pool balance</strong> and <strong>added to the GCI</strong> before the split.</li>
  <li>The remaining pool balance is displayed to all roles (Agent, TC, Staff, Admin) in the transaction form.</li>
  <li>If the allocated items exceed the pool total, the system will display a warning.</li>
</ul>

<h3>Example Calculation</h3>
<table>
  <thead>
    <tr><th>Item</th><th>Amount</th><th>Effect on Pool</th><th>Effect on GCI</th></tr>
  </thead>
  <tbody>
    <tr><td>Total Seller-Paid Closing Cost</td><td>$5,000</td><td>—</td><td>—</td></tr>
    <tr><td>Shortage in Commission (from pool)</td><td>$1,000</td><td>−$1,000</td><td>+$1,000</td></tr>
    <tr><td>Transaction Compliance Fee (from pool)</td><td>$395</td><td>−$395</td><td>+$395</td></tr>
    <tr><td>Home Warranty (from pool)</td><td>$700</td><td>−$700</td><td>+$700</td></tr>
    <tr><td><strong>Remaining for Buyer Closing Costs</strong></td><td><strong>$2,905</strong></td><td>—</td><td>—</td></tr>
    <tr><td><strong>Adjusted GCI (Base + Pool Items)</strong></td><td colspan="3"><strong>$9,000 + $2,095 = $11,095</strong> (on a $300K sale at 3%)</td></tr>
  </tbody>
</table>

<h2>Three Simulation Scenarios</h2>

<h3>Scenario 1: Agent Absorbs Shortage, Agent Pays Tx Fee, Buyer Pays Warranty</h3>
<table>
  <thead><tr><th>Step</th><th>Calculation</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Sale Price × Commission %</td><td>$200,000 × 3%</td><td>$6,000 Base GCI</td></tr>
    <tr><td>Shortage (Agent Absorbs)</td><td>Write-off — no effect</td><td>$6,000 GCI</td></tr>
    <tr><td>Warranty (Buyer Pays)</td><td>+$500 added to GCI</td><td>$6,500 Adjusted GCI</td></tr>
    <tr><td>Agent Split (70%)</td><td>$6,500 × 70%</td><td>$4,550</td></tr>
    <tr><td>Tx Fee (Agent Pays)</td><td>$4,550 − $395</td><td><strong>$4,155 Agent Take-Home</strong></td></tr>
  </tbody>
</table>

<h3>Scenario 2: Agent Pays Warranty (Pre-Split Deduction), Buyer Pays Tx Fee</h3>
<table>
  <thead><tr><th>Step</th><th>Calculation</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Sale Price × Commission %</td><td>$200,000 × 3%</td><td>$6,000 Base GCI</td></tr>
    <tr><td>Warranty (Agent Pays)</td><td>$6,000 − $500 (pre-split)</td><td>$5,500 GCI</td></tr>
    <tr><td>Tx Fee (Buyer Pays)</td><td>+$395 added to GCI</td><td>$5,895 Adjusted GCI</td></tr>
    <tr><td>Agent Split (70%)</td><td>$5,895 × 70%</td><td>$4,126.50</td></tr>
    <tr><td>No post-split deductions</td><td>—</td><td><strong>$4,126.50 Agent Take-Home</strong></td></tr>
  </tbody>
</table>

<h3>Scenario 3: All Items Paid from Seller Closing Cost Pool</h3>
<table>
  <thead><tr><th>Step</th><th>Calculation</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Sale Price × Commission %</td><td>$300,000 × 3%</td><td>$9,000 Base GCI</td></tr>
    <tr><td>Shortage + Tx Fee + Warranty (from pool)</td><td>+$1,000 + $395 + $700</td><td>$11,095 Adjusted GCI</td></tr>
    <tr><td>Agent Split (70%)</td><td>$11,095 × 70%</td><td>$7,766.50</td></tr>
    <tr><td>No post-split deductions</td><td>—</td><td><strong>$7,766.50 Agent Take-Home</strong></td></tr>
    <tr><td>Pool Remaining</td><td>$5,000 − $2,095</td><td><strong>$2,905 for Buyer Closing Costs</strong></td></tr>
  </tbody>
</table>

<h2>What Each Role Sees</h2>
<table>
  <thead><tr><th>Information</th><th>Agent</th><th>TC / Admin / Staff</th></tr></thead>
  <tbody>
    <tr><td>Commission Percentage</td><td>✓</td><td>✓</td></tr>
    <tr><td>Agent Split %</td><td>✓</td><td>✓</td></tr>
    <tr><td>Agent Net Take-Home</td><td>✓</td><td>✓</td></tr>
    <tr><td>Gross Commission Income (GCI)</td><td>✗</td><td>✓</td></tr>
    <tr><td>Broker Split % and Broker Net</td><td>✗</td><td>✓</td></tr>
    <tr><td>Closing Cost Pool Breakdown</td><td>✓</td><td>✓</td></tr>
    <tr><td>All Deductions and Overrides</td><td>✗</td><td>✓</td></tr>
  </tbody>
</table>

<h2>Quick Reference</h2>
<ul>
  <li><strong>Shortage (Agent Absorbs):</strong> Write-off. No GCI effect. No deduction from agent net.</li>
  <li><strong>Tx Fee (Agent Pays):</strong> Post-split deduction. Deducted from agent net after split is calculated.</li>
  <li><strong>Warranty (Agent Pays):</strong> Pre-split reduction. Deducted from GCI before split is calculated.</li>
  <li><strong>Any item (Buyer Pays Directly or from Closing Cost Pool):</strong> Adds to GCI before split. No deduction from agent net.</li>
</ul>
    `,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return articles visible to a given role */
export function getArticlesForRole(role: 'agent' | 'staff' | 'admin' | 'tc'): Article[] {
  if (role === 'agent') {
    return ARTICLES.filter((a) => a.audience === 'agent' || a.audience === 'both');
  }
  // staff / admin / tc see everything
  return ARTICLES;
}

/** Return a single article by id */
export function getArticleById(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id);
}
