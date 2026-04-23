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
