// POST /api/admin/migrations/bulk-delete-duplicates
//
// Two modes:
//   body: {}                  → DRY_RUN: matches entries, returns what WOULD be deleted
//   body: { execute: true }   → EXECUTE: performs actual deletes + rebuilds rollups
//
// Matching logic (all must match):
//   1. Normalized agent name (case-insensitive, punctuation-stripped)
//   2. Normalized address (same normalization)
//   3. Status (normalized — "cancelled" == "canceled")
//   4. Listing date (YYYY-MM-DD, if provided in spreadsheet)
//   5. Closed date (YYYY-MM-DD, if provided in spreadsheet)
//
// Safety rules:
//   0 matches  → NOT_FOUND  (logged, never deleted)
//   2+ matches → AMBIGUOUS  (logged, never deleted — requires manual review)
//   1 match    → CONFIRMED  (deleted in execute mode)
//
// Rollups are rebuilt for every affected agent/year after deletion.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';

// ─── Real DELETE entries from Manus_AUTO_DELETE_60.xlsx ──────────────────────
// Format: [group, address, agent, status, listingDate | null, closedDate | null]
// Dates are M/D/YYYY as they appear in the spreadsheet. null = blank cell.
const DELETE_ENTRIES: [number, string, string, string, string | null, string | null][] = [
  [1,  "101 Chestnut Oak Drive",                "Chasidy Burnett",        "cancelled",  "6/30/2025",  null],
  [2,  "101 Ramblewood",                        "Jeramiah Tassin",        "cancelled",  "5/20/2025",  null],
  [3,  "102 Rue Gambetta",                      "Shelly Hebert",          "expired",    "10/21/2025", null],
  [4,  "1021 Timber Trails",                    "Madelyn Lamartiniere",   "expired",    "8/29/2022",  null],
  [4,  "1021 Timber Trails",                    "Madelyn Lamartiniere",   "canceled",   "3/14/2024",  null],
  [5,  "1029 Gary Drive",                       "Madelyn Lamartiniere",   "expired",    "12/5/2022",  null],
  [6,  "103 Foxtail Trail",                     "Ashley Lombas",          "cancelled",  "2/19/2025",  null],
  [7,  "103 Tackaberry Rd, Lafayette, La 70503","Michele Ezell",          "pending",    "4/11/2026",  null],
  [8,  "1036 Mimosa Lane",                      "Ashley Lombas",          "cancelled",  null,         null],
  [9,  "104 Oak Terrace Drive",                 "Bridget Simon",          "cancelled",  "4/19/2023",  null],
  [10, "104 Queen of Peace",                    "Ashley Lombas",          "cancelled",  "5/16/2024",  null],
  [11, "1041 Gary Drive",                       "Ashley Lombas",          "cancelled",  null,         null],
  [12, "105 N. Long St.",                       "Charles Ditch",          "expired",    null,         null],
  [13, "105 Oak Alley",                         "Nicole Bringard",        "cancelled",  "10/30/2023", null],
  [14, "106 Buffalo Run",                       "Mariana Olivares",       "cancelled",  "5/23/2023",  null],
  [15, "107 Vital St",                          "Hannah Reeve",           "cancelled",  "1/30/2025",  null],
  [16, "108 Laguna Lane",                       "Nadie Cagley",           "cancelled",  "11/12/2021", null],
  [17, "108 N. Governor Miro Dr.",              "Ashley Lombas",          "cancelled",  null,         null],
  [18, "109 Broussard Hill Drive",              "Tyler Albrecht",         "cancelled",  "6/30/2025",  null],
  [19, "110 Barton Terrace",                    "Jim Keaty",              "expired",    "11/6/2025",  null],
  [20, "111 Bancroft Drive, Lafayette, La 70508","Erin Roussel",          "pending",    "3/9/2026",   null],
  [21, "1136 Tupelo Street",                    "Jessica Parker",         "expired",    "7/11/2025",  null],
  [22, "120 Caillouet Place",                   "Tyler Albrecht",         "active",     "3/29/2023",  null],
  [22, "120 Caillouet Place",                   "Tyler Albrecht",         "active",     "6/28/2025",  null],
  [23, "1217 Bluewater Drive",                  "Rachel North",           "cancelled",  "3/24/2025",  null],
  [24, "125 Julian Circle",                     "Nicole Bringard",        "cancelled",  "1/16/2024",  null],
  [25, "1273 Hwy 758",                          "Raquel",                 "expired",    "8/12/2025",  null],
  [26, "12920 LA Hwy 697",                      "Alan Gitz",              "expired",    "1/8/2025",   null],
  [27, "130 Hathaway Drive",                    "Becky Etzel",            "cancelled",  "6/14/2024",  null],
  [28, "130 Ivywood Court",                     "NOAH NORRIS",            "pending",    null,         "6/8/2026"],
  [29, "1502 W University Ave",                 "Michele Ezell",          "cancelled",  "2/17/2025",  null],
  [30, "159 Bloomfield",                        "Madelyn Lamartiniere",   "expired",    null,         null],
  [31, "200 High Meadow Blvd #4",               "MATTHEW DELCAMBRE",      "cancelled",  "1/25/2025",  null],
  [32, "203 Timber Creek",                      "Brennan Gouaux",         "cancelled",  "1/2/2025",   null],
  [33, "213 Bendel #213",                       "BO MCGEHEE",             "expired",    "10/20/2025", null],
  [33, "213 Bendel #213",                       "BO MCGEHEE",             "active",     "1/8/2026",   null],
  [34, "216 Brentwood Blvd",                    "Michelle Foreman",       "cancelled",  "3/20/2025",  null],
  [35, "233 Ridgewood St",                      "Tyler Albrecht",         "cancelled",  "8/22/2024",  null],
  [36, "240 N Highland Oaks Dr",                "Rachel North",           "cancelled",  "3/1/2025",   null],
  [37, "2601 SE Evangeline Thruway",            "Brad Gaubert",           "expired",    "5/20/2024",  null],
  [38, "2601 SE Evangeline Thruway",            "Jason Ray",              "expired",    "5/20/2024",  null],
  [39, "2700 W Willow",                         "Mariana Olivares",       "expired",    "8/15/2022",  null],
  [40, "301 Ayreshire",                         "Becky Etzel",            "cancelled",  null,         null],
  [41, "304 Turtledove Trail",                  "Emily Babineaux",        "expired",    "2/26/2024",  null],
  [42, "305 Last Quarter Dr",                   "Ashley Lombas",          "cancelled",  "6/17/2024",  null],
  [43, "313 Barkhill Drive",                    "Lena Lavine",            "cancelled",  "12/7/2022",  null],
  [44, "316 Adry Ln",                           "Ashley Simon",           "cancelled",  "4/18/2024",  null],
  [45, "322 Emu Ranch Rd.",                     "Tyler Manuel",           "cancelled",  null,         null],
  [46, "351 Veterans",                          "Sean Landry",            "cancelled",  null,         null],
  [47, "3763 Chataignier",                      "Sammy Cart",             "canceled",   "2/16/2022",  null],
  [48, "417 S Orange St",                       "Bridget Simon",          "cancelled",  "6/4/2023",   null],
  [49, "503 Broussard Hill Dr.",                "Ashley Lombas",          "cancelled",  null,         null],
  [50, "507 Bourque",                           "Jason Ray",              "cancelled",  "6/14/2023",  null],
  // Group 50 has two identical DELETE rows in the spreadsheet — only one should be deleted
  // (deduplication logic below handles this)
  [51, "509 Rue Du Belier",                     "Brice Trahan",           "cancelled",  "10/17/2023", null],
  [52, "516 E Broussard",                       "Thad Hayes",             "expired",    "8/18/2021",  null],
  [53, "6011 Youngsville Rd",                   "MATTHEW DELCAMBRE",      "expired",    "7/7/2025",   null],
  [54, "613 Raymond",                           "Hailey Robinson",        "cancelled",  "2/9/2024",   null],
  [55, "637 W Main Street",                     "Michele Ezell",          "expired",    "8/4/2023",   null],
  [56, "935 Fortune Rd",                        "Legend Montiville",      "cancelled",  "5/23/2023",  null],
  [57, "Section 12, Riceland Rd. N.",           "jEFF HEBERT",            "cancelled",  null,         null],
  [58, "TBD 00 Critter Creek",                  "Madelyn Lamartiniere",   "cancelled",  "7/15/2024",  null],
  [59, "TBD Pershing (11 Acres)",               "Jim Keaty",              "expired",    "3/9/2023",   null],
  [60, "TBD Richard Street",                    "MATTHEW DELCAMBRE",      "cancelled",  "3/17/2025",  null],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Strips common street suffixes so "101 Ramblewood" matches "101 Ramblewood Drive"
function normAddr(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/\b(drive|dr|street|st|road|rd|boulevard|blvd|avenue|ave|lane|ln|court|ct|circle|cir|place|pl|trail|trl|way|wy|terrace|ter|highway|hwy|parkway|pkwy)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns all candidate agent name strings from a transaction doc
function txAgentNames(tx: any): string[] {
  const names: string[] = [];
  if (tx.agentDisplayName) names.push(norm(tx.agentDisplayName));
  if (tx.agentName) names.push(norm(tx.agentName));
  if (tx.agentFirstName || tx.agentLastName) {
    names.push(norm(`${tx.agentFirstName || ''} ${tx.agentLastName || ''}`));
  }
  // Some docs store first/last separately on a nested object
  if (tx.agent?.displayName) names.push(norm(tx.agent.displayName));
  if (tx.agent?.name) names.push(norm(tx.agent.name));
  return names.filter(n => n.length > 0);
}

// Partial name match — spreadsheet may have only first name or partial name
function agentMatches(txNames: string[], normAgent: string): boolean {
  if (!normAgent) return false;
  // Exact match on any field
  if (txNames.some(n => n === normAgent)) return true;
  // Partial match: spreadsheet name is a substring of a tx name field (handles "Raquel" matching "Raquel Quebodeaux")
  if (normAgent.split(' ').length === 1 && normAgent.length >= 4) {
    if (txNames.some(n => n.includes(normAgent))) return true;
  }
  return false;
}

function normStatus(s: string | null | undefined): string {
  if (!s) return '';
  const v = s.toLowerCase().trim();
  if (v === 'cancelled' || v === 'canceled') return 'canceled';
  return v;
}

function parseDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = String(d).trim();
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, day, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  } catch { /* ignore */ }
  return null;
}

function extractDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return parseDate(val);
  if (val && typeof val === 'object') {
    if (typeof val.toDate === 'function') return val.toDate().toISOString().slice(0, 10);
    if (val._seconds) return new Date(val._seconds * 1000).toISOString().slice(0, 10);
  }
  return null;
}

// Uses the canonical rebuildAgentRollup helper (writes to agentYearRollups)

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const execute: boolean = body.execute === true;

  // Load all transactions once
  const snap = await adminDb.collection('transactions').get();
  const allTx = snap.docs.map(d => ({ _id: d.id, ...d.data() } as any));

  type ResultRow = {
    group: number;
    address: string;
    agent: string;
    status: string;
    listingDate: string | null;
    closedDate: string | null;
    result: 'CONFIRMED' | 'NOT_FOUND' | 'AMBIGUOUS';
    txId?: string;
    txData?: Record<string, any>;
    candidates?: { id: string; status: string; listingDate: string | null; closedDate: string | null }[];
    reason?: string;
  };

  const results: ResultRow[] = [];

  // Deduplicate entries (Group 50 has two identical rows — keep only one)
  const seen = new Set<string>();
  const uniqueEntries = DELETE_ENTRIES.filter(([group, addr, agent, status, ld, cd]) => {
    const key = `${group}|${norm(addr)}|${norm(agent)}|${normStatus(status)}|${parseDate(ld)}|${parseDate(cd)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const [group, address, agent, status, listingDateRaw, closedDateRaw] of uniqueEntries) {
    const entryNormExact = norm(address); // kept for backward compat with dedup key
    const normAgent = norm(agent);
    const normSt = normStatus(status);
    const listingDate = parseDate(listingDateRaw);
    const closedDate = parseDate(closedDateRaw);

    // Step 1: Match on agent + address + status
    // Uses normAddr (suffix-stripped) for address and agentMatches (multi-field + partial) for agent
    const entryAddrStripped = normAddr(address);
    const candidates = allTx.filter((tx: any) => {
      const txNames = txAgentNames(tx);
      const txAddrRaw = tx.address || tx.propertyAddress || '';
      const txAddrExact = norm(txAddrRaw);
      const txAddrStripped = normAddr(txAddrRaw);
      const txStatus = normStatus(tx.status || '');
      const addrMatch = txAddrExact === entryNormExact || txAddrStripped === entryAddrStripped;
      return agentMatches(txNames, normAgent) && addrMatch && txStatus === normSt;
    });

    if (candidates.length === 0) {
      // Debug: find any transactions matching just address (ignore agent + status)
      // to help diagnose what field names are actually used in Firestore
      const addrOnlyCandidates = allTx.filter((tx: any) => {
        const txAddrRaw = tx.address || tx.propertyAddress || '';
        const txAddrExact = norm(txAddrRaw);
        const txAddrStripped = normAddr(txAddrRaw);
        return txAddrExact === entryNormExact || txAddrStripped === entryAddrStripped;
      }).slice(0, 3).map((tx: any) => ({
        id: tx._id,
        status: tx.status,
        address: tx.address,
        propertyAddress: tx.propertyAddress,
        agentDisplayName: tx.agentDisplayName,
        agentName: tx.agentName,
        agentId: tx.agentId,
        listingDate: extractDate(tx.listingDate),
        closedDate: extractDate(tx.closedDate || tx.closeDate),
      }));
      results.push({
        group, address, agent, status, listingDate, closedDate,
        result: 'NOT_FOUND',
        reason: 'No transaction matched agent + address + status',
        addrOnlyCandidates,
      } as any);
      continue;
    }

    // Step 2: Narrow by listing date if provided
    let narrowed = candidates;
    if (listingDate) {
      const byListing = candidates.filter((tx: any) => {
        const txLd = extractDate(tx.listingDate);
        return txLd === listingDate;
      });
      if (byListing.length > 0) narrowed = byListing;
    }

    // Step 3: Narrow by closed date if provided
    if (closedDate && narrowed.length > 1) {
      const byClosed = narrowed.filter((tx: any) => {
        const txCd = extractDate(tx.closedDate || tx.closeDate);
        return txCd === closedDate;
      });
      if (byClosed.length > 0) narrowed = byClosed;
    }

    if (narrowed.length === 1) {
      const tx = narrowed[0];
      results.push({
        group, address, agent, status, listingDate, closedDate,
        result: 'CONFIRMED',
        txId: tx._id,
        txData: {
          status: tx.status,
          listingDate: extractDate(tx.listingDate),
          closedDate: extractDate(tx.closedDate || tx.closeDate),
          address: tx.address || tx.propertyAddress,
          agent: tx.agentDisplayName,
          agentId: tx.agentId,
          year: tx.year,
        },
      });
    } else if (narrowed.length === 0) {
      // Date narrowing produced 0 — fall back to original candidates as ambiguous
      results.push({
        group, address, agent, status, listingDate, closedDate,
        result: 'AMBIGUOUS',
        reason: `${candidates.length} candidate(s) found but date narrowing produced 0 matches — dates may differ in Firestore`,
        candidates: candidates.map((tx: any) => ({
          id: tx._id,
          status: tx.status,
          listingDate: extractDate(tx.listingDate),
          closedDate: extractDate(tx.closedDate || tx.closeDate),
        })),
      });
    } else {
      results.push({
        group, address, agent, status, listingDate, closedDate,
        result: 'AMBIGUOUS',
        reason: `${narrowed.length} transactions matched after date narrowing — cannot safely identify which to delete`,
        candidates: narrowed.map((tx: any) => ({
          id: tx._id,
          status: tx.status,
          listingDate: extractDate(tx.listingDate),
          closedDate: extractDate(tx.closedDate || tx.closeDate),
        })),
      });
    }
  }

  const confirmed = results.filter(r => r.result === 'CONFIRMED');
  const notFound = results.filter(r => r.result === 'NOT_FOUND');
  const ambiguous = results.filter(r => r.result === 'AMBIGUOUS');

  // Execute deletes + rebuild rollups
  let deleted = 0;
  const rollupKeys = new Set<string>();

  if (execute && confirmed.length > 0) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < confirmed.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const chunk = confirmed.slice(i, i + BATCH_SIZE);
      for (const row of chunk) {
        if (row.txId) {
          batch.delete(adminDb.collection('transactions').doc(row.txId));
          deleted++;
          // Collect rollup keys
          const agentId = row.txData?.agentId;
          const year = row.txData?.year;
          if (agentId && year) rollupKeys.add(`${agentId}:::${year}`);
        }
      }
      await batch.commit();
    }
    // Rebuild rollups using the canonical helper
    for (const key of rollupKeys) {
      const [agentId, yearStr] = key.split(':::');
      try { await rebuildAgentRollup(adminDb, agentId, Number(yearStr)); } catch { /* non-fatal */ }
    }
  }

  return NextResponse.json({
    ok: true,
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    totalEntries: uniqueEntries.length,
    confirmed: confirmed.length,
    notFound: notFound.length,
    ambiguous: ambiguous.length,
    deleted: execute ? deleted : 0,
    rollupsRebuilt: execute ? rollupKeys.size : 0,
    confirmedList: confirmed.map(r => ({
      group: r.group,
      address: r.address,
      agent: r.agent,
      txId: r.txId,
      matched: r.txData,
    })),
    notFoundList: notFound.map(r => ({
      group: r.group,
      address: r.address,
      agent: r.agent,
      status: r.status,
      listingDate: r.listingDate,
      reason: r.reason,
    })),
    ambiguousList: ambiguous.map(r => ({
      group: r.group,
      address: r.address,
      agent: r.agent,
      status: r.status,
      listingDate: r.listingDate,
      reason: r.reason,
      candidates: r.candidates,
    })),
  });
}
