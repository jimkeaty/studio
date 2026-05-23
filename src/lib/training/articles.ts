/**
 * Smart Broker USA — Training & Help Center Article Library
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
    <tr><td>Agent changes status to Active, Pending, Temp Off Market, Closed, Cancelled, or Expired</td><td>Status Change</td><td>No</td></tr>
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
      'A step-by-step guide to submitting a new listing or deal through the Add Transaction form.',
    category: 'Transactions',
    audience: 'agent',
    readingTimeMinutes: 4,
    publishedAt: '2026-04-23',
    content: `
<h2>Overview</h2>
<p>Use the <strong>Add Transaction</strong> button in the sidebar (or the center button on mobile) to submit any new listing or deal to the system. The form routes your submission to the correct queues automatically.</p>

<h2>Step-by-Step</h2>
<ol>
  <li>Click <strong>Add Transaction</strong> in the sidebar.</li>
  <li>Select a <strong>Status</strong> — this is required. Choose <em>Active</em> for a new listing, or <em>Pending</em> if the property is already under contract.</li>
  <li>Enter the <strong>Property Address</strong> and <strong>Sale Price</strong>.</li>
  <li>Fill in the relevant <strong>dates</strong> (Contract Date, Projected Close Date, Inspection Deadline).</li>
  <li>Enter <strong>Buyer</strong> and/or <strong>Seller</strong> contact information.</li>
  <li>Check <strong>"Working with TC"</strong> if a Transaction Coordinator is handling your paperwork — this routes the submission to the TC Queue as well.</li>
  <li>Add any notes for the staff or TC in the <strong>Notes</strong> field.</li>
  <li>Click <strong>Submit</strong>.</li>
</ol>

<h2>What Happens After You Submit</h2>
<ul>
  <li>Your transaction appears immediately in your <strong>My Transactions</strong> section on the dashboard.</li>
  <li>A <strong>Staff Queue</strong> item is created so staff can update the MLS.</li>
  <li>If you checked "Working with TC," a <strong>TC Queue</strong> item is also created for your TC to review and process the paperwork.</li>
</ul>
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
