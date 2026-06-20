// src/app/api/admin/import-mls-listings/route.ts
// POST /api/admin/import-mls-listings
//
// Imports full MLS listing detail exports (individual transactions per row).
// Handles the Keaty Real Estate MLS export format from their MLS system.
//
// STATUS CODES:
//   C = Sold/Closed   → status: 'closed',   uses Sold Date as closeDate
//   L = Canceled      → status: 'canceled', uses Cancel Date
//   E = Expired       → status: 'expired',  uses End Date
//
// DEDUPLICATION:
//   Uses MLS List Number as the unique key. Same address with different
//   List Number = different transaction (valid re-list). Only skips if
//   the exact List Number already exists in Firestore.
//
// SIDE TYPE:
//   sideType: 'listing' | 'buyer'
//   For listing side: Listing Agent = primary, Co-Listing Agent = co-agent (also our office)
//   For buyer side:   Buyer Agent = primary, Co-Buyer Agent = co-agent
//
// CONTAMINATION GUARD:
//   If sideType='listing' and a buyer-agent column is detected → returns 400 with warning
//   If sideType='buyer' and a listing-agent column is detected → returns 400 with warning
//
// Firestore: transactions/{autoId} with source: 'mls_import', mlsListNumber, importBatchId

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { FieldValue } from 'firebase-admin/firestore';

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function toNum(v: any): number {
  const n = Number(String(v ?? '').replace(/[$,%\s,]/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseDate(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function yearFromDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const y = parseInt(dateStr.slice(0, 4));
  return y >= 1990 && y <= 2100 ? y : null;
}

// Build a full address string from MLS columns
function buildAddress(row: Record<string, string>): string {
  const num = row['street number'] ?? row['streetnumber'] ?? '';
  const dir = row['dir'] ?? '';
  const name = row['street name'] ?? row['streetname'] ?? '';
  const suffix = row['st suffix'] ?? row['stsuffix'] ?? row['suffix'] ?? '';
  const unit = row['unit #'] ?? row['unit'] ?? '';
  const city = row['city'] ?? '';
  const state = row['state'] ?? '';
  const zip = row['zip code'] ?? row['zip'] ?? '';

  const parts = [num, dir, name, suffix].filter(Boolean).join(' ').trim();
  const unitPart = unit ? `Unit ${unit}` : '';
  const cityPart = [city, state, zip].filter(Boolean).join(', ');
  return [parts, unitPart, cityPart].filter(Boolean).join(', ');
}

// Normalize CSV headers: trim, lowercase, collapse whitespace
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Parse CSV with quoted field support
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.every(v => !v)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

// Detect contamination: buyer-agent columns in a listing upload (or vice versa)
const BUYER_AGENT_COLUMNS = [
  'buyer agent', 'buyers agent', "buyer's agent", 'selling agent', 'selling office agent',
  'buyer broker', 'co-op agent', 'coop agent', 'buyer rep', 'buyer representative',
];
const LISTING_AGENT_COLUMNS = [
  'listing agent', 'list agent', 'seller agent', "seller's agent", 'sellers agent',
  'listing broker', 'co-listing agent',
];

function detectContamination(headers: string[], sideType: 'listing' | 'buyer'): string[] {
  const forbidden = sideType === 'listing' ? BUYER_AGENT_COLUMNS : LISTING_AGENT_COLUMNS;
  return headers.filter(h => forbidden.some(f => h.includes(f)));
}

// Fuzzy name similarity (Jaro-Winkler simplified)
function nameSimilarity(a: string, b: string): number {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxDist = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  if (maxDist < 0) return 0;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  const prefix = Math.min(4, [...a].findIndex((c, i) => c !== b[i]) === -1 ? Math.min(a.length, b.length) : [...a].findIndex((c, i) => c !== b[i]));
  return jaro + prefix * 0.1 * (1 - jaro);
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return jsonError(401, 'Unauthorized');

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const ok = await isAdminLike(decoded.uid);
    if (!ok) return jsonError(403, 'Forbidden');

    const contentType = req.headers.get('content-type') ?? '';
    let csvText = '';
    let sideType: 'listing' | 'buyer' = 'listing';
    let agentResolutions: Record<string, { action: string; agentId?: string; displayName?: string }> = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return jsonError(400, 'No file provided');
      csvText = await file.text();
      sideType = (formData.get('sideType') as 'listing' | 'buyer') ?? 'listing';
      const resStr = formData.get('agentResolutions') as string | null;
      if (resStr) {
        try { agentResolutions = JSON.parse(resStr); } catch { /* ignore */ }
      }
    } else {
      const body = await req.json();
      csvText = body.csv ?? '';
      sideType = body.sideType ?? 'listing';
      agentResolutions = body.agentResolutions ?? {};
    }

    if (!csvText.trim()) return jsonError(400, 'Empty CSV');

    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) return jsonError(400, 'No data rows found');

    // ── Contamination check ───────────────────────────────────────────────────
    const contaminatedCols = detectContamination(headers, sideType);
    if (contaminatedCols.length > 0) {
      return jsonError(400,
        sideType === 'listing'
          ? `This file contains buyer-agent columns (${contaminatedCols.join(', ')}). ` +
            `Please remove these columns before uploading a listing-side file to avoid importing the wrong agent's name.`
          : `This file contains listing-agent columns (${contaminatedCols.join(', ')}). ` +
            `Please remove these columns before uploading a buyer-side file.`,
        { contaminatedColumns: contaminatedCols }
      );
    }

    // ── Resolve agent column names based on side type ─────────────────────────
    const primaryAgentCol = sideType === 'listing'
      ? (headers.find(h => h === 'listing agent' || h === 'list agent') ?? 'listing agent')
      : (headers.find(h => h === 'buyer agent' || h === 'buyers agent' || h === "buyer's agent" || h === 'selling agent') ?? 'buyer agent');

    const coAgentCol = sideType === 'listing'
      ? (headers.find(h => h === 'co-listing agent' || h === 'co listing agent') ?? null)
      : (headers.find(h => h === 'co-buyer agent' || h === 'co buyer agent') ?? null);

    // ── Load existing agent profiles for matching ─────────────────────────────
    const agentSnap = await adminDb.collection('agentProfiles').get();
    const allAgents = agentSnap.docs.map(d => ({
      agentId: d.id,
      displayName: String(d.data().displayName ?? d.data().name ?? '').trim(),
      status: String(d.data().status ?? 'active').toLowerCase(),
      isActive: !['inactive', 'terminated', 'out', 'former'].includes(
        String(d.data().status ?? '').toLowerCase()
      ),
    })).filter(a => a.displayName);

    const activeAgents = allAgents.filter(a => a.isActive);

    // Agent lookup cache: csvName → resolved agentId
    const agentCache: Record<string, { agentId: string; displayName: string; created: boolean }> = {};

    async function resolveAgent(csvName: string): Promise<{ agentId: string; displayName: string; created: boolean } | null> {
      if (!csvName) return null;
      if (agentCache[csvName]) return agentCache[csvName];

      // Check user-provided resolution decisions
      const decision = agentResolutions[csvName];
      if (decision) {
        if (decision.action === 'skip') return null;
        if ((decision.action === 'use_existing' || decision.action === 'historical') && decision.agentId) {
          const agent = allAgents.find(a => a.agentId === decision.agentId);
          if (agent) {
            agentCache[csvName] = { agentId: agent.agentId, displayName: agent.displayName, created: false };
            return agentCache[csvName];
          }
        }
        if (decision.action === 'create_new') {
          const newRef = adminDb.collection('agentProfiles').doc();
          await newRef.set({
            displayName: decision.displayName ?? csvName,
            status: 'inactive',
            source: 'mls_import',
            createdAt: new Date().toISOString(),
            onboardingComplete: false,
          });
          agentCache[csvName] = { agentId: newRef.id, displayName: decision.displayName ?? csvName, created: true };
          return agentCache[csvName];
        }
      }

      // Exact match on active agents
      const exactActive = activeAgents.find(a => a.displayName.toLowerCase() === csvName.toLowerCase());
      if (exactActive) {
        agentCache[csvName] = { agentId: exactActive.agentId, displayName: exactActive.displayName, created: false };
        return agentCache[csvName];
      }

      // Fuzzy match on active agents (≥ 88% similarity)
      let bestMatch: typeof activeAgents[0] | null = null;
      let bestSim = 0;
      for (const agent of activeAgents) {
        const sim = nameSimilarity(csvName, agent.displayName);
        if (sim > bestSim) { bestSim = sim; bestMatch = agent; }
      }
      if (bestMatch && bestSim >= 0.88) {
        agentCache[csvName] = { agentId: bestMatch.agentId, displayName: bestMatch.displayName, created: false };
        return agentCache[csvName];
      }

      // Check inactive agents — exact match
      const exactInactive = allAgents.find(a => !a.isActive && a.displayName.toLowerCase() === csvName.toLowerCase());
      if (exactInactive) {
        // Former agent — import as historical (no onboarding)
        agentCache[csvName] = { agentId: exactInactive.agentId, displayName: exactInactive.displayName, created: false };
        return agentCache[csvName];
      }

      // No match — create a minimal historical profile (no onboarding)
      const newRef = adminDb.collection('agentProfiles').doc();
      await newRef.set({
        displayName: csvName,
        status: 'inactive',
        source: 'mls_import',
        createdAt: new Date().toISOString(),
        onboardingComplete: false,
        historical: true,
      });
      agentCache[csvName] = { agentId: newRef.id, displayName: csvName, created: true };
      return agentCache[csvName];
    }

    // ── Fetch existing MLS list numbers to detect duplicates ──────────────────
    const existingSnap = await adminDb
      .collection('transactions')
      .where('source', '==', 'mls_import')
      .where('mlsListNumber', '!=', '')
      .select('mlsListNumber')
      .get();
    const existingListNumbers = new Set(existingSnap.docs.map(d => String(d.data().mlsListNumber ?? '')).filter(Boolean));

    // ── Import batch ID ───────────────────────────────────────────────────────
    const importBatchId = `mls_${sideType}_${Date.now()}`;
    const now = new Date().toISOString();

    // ── Process rows ──────────────────────────────────────────────────────────
    let imported = 0;
    let skippedDuplicates = 0;
    let skippedNoAgent = 0;
    let failed = 0;
    const errors: { row: number; error: string }[] = [];
    const autoCreatedAgents: { name: string; agentId: string }[] = [];
    const formerAgents: { name: string; agentId: string }[] = [];
    const fuzzyMatched: { csvName: string; matchedName: string; similarity: number }[] = [];

    const batch = adminDb.batch();
    let batchCount = 0;
    const MAX_BATCH = 400;

    async function flushBatch() {
      if (batchCount > 0) {
        await batch.commit();
        batchCount = 0;
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        // MLS List Number — dedup key
        const mlsListNumber = String(row['list number'] ?? row['listnumber'] ?? row['mls number'] ?? row['mls#'] ?? '').trim();

        // Skip duplicates by List Number
        if (mlsListNumber && existingListNumbers.has(mlsListNumber)) {
          skippedDuplicates++;
          continue;
        }

        // Agent name
        const agentName = String(row[primaryAgentCol] ?? '').trim();
        if (!agentName) {
          skippedNoAgent++;
          continue;
        }

        // Resolve agent
        const resolved = await resolveAgent(agentName);
        if (!resolved) {
          skippedNoAgent++;
          continue;
        }
        if (resolved.created) {
          autoCreatedAgents.push({ name: agentName, agentId: resolved.agentId });
        }

        // Co-agent (optional)
        let coAgentId: string | null = null;
        let coAgentName: string | null = null;
        if (coAgentCol) {
          const coName = String(row[coAgentCol] ?? '').trim();
          if (coName && coName.toLowerCase() !== agentName.toLowerCase()) {
            const coResolved = await resolveAgent(coName);
            if (coResolved) {
              coAgentId = coResolved.agentId;
              coAgentName = coResolved.displayName;
              if (coResolved.created) {
                autoCreatedAgents.push({ name: coName, agentId: coResolved.agentId });
              }
            }
          }
        }

        // Status mapping
        const rawStatus = String(row['status'] ?? '').trim().toUpperCase();
        let status: string;
        switch (rawStatus) {
          case 'C': status = 'closed'; break;
          case 'L': status = 'canceled'; break;
          case 'E': status = 'expired'; break;
          default:  status = rawStatus.toLowerCase() || 'unknown';
        }

        // Dates
        const listingDate = parseDate(row['listing date'] ?? row['listingdate'] ?? row['list date']);
        const soldDate = parseDate(row['sold date'] ?? row['solddate'] ?? row['close date'] ?? row['closedate']);
        const cancelDate = parseDate(row['cancel date'] ?? row['canceldate']);
        const underContractDate = parseDate(row['under contract date'] ?? row['undercontractdate'] ?? row['under contr date']);
        const endDate = parseDate(row['end date'] ?? row['enddate'] ?? row['expiration date']);
        const backOnMarketDate = parseDate(row['back on market date'] ?? row['backonmarketdate']);
        const projectedCloseDate = parseDate(row['projected closing date'] ?? row['projectedclosingdate'] ?? row['proj close']);

        // Determine the effective close/end date for year attribution
        let closeDate: string | null = null;
        if (status === 'closed') closeDate = soldDate;
        else if (status === 'canceled') closeDate = cancelDate;
        else if (status === 'expired') closeDate = endDate;

        const year = yearFromDate(closeDate) ?? yearFromDate(listingDate);
        if (!year) {
          errors.push({ row: rowNum, error: `Could not determine year for row ${rowNum}` });
          failed++;
          continue;
        }

        // Prices
        const listPrice = toNum(row['listing price'] ?? row['listprice'] ?? row['list price'] ?? row['original list price']);
        const salePrice = toNum(row['sold price'] ?? row['soldprice'] ?? row['sale price'] ?? row['saleprice']);
        const originalListPrice = toNum(row['original list price'] ?? row['originallistprice']);

        // Address
        const address = buildAddress(row);
        if (!address.trim()) {
          errors.push({ row: rowNum, error: `No address found for row ${rowNum}` });
          failed++;
          continue;
        }

        // Property details
        const propertyType = row['property type'] ?? row['propertytype'] ?? row['sub-type'] ?? '';
        const sqft = toNum(row['sqft - living'] ?? row['sqftliving'] ?? row['sqft'] ?? '');
        const bedrooms = toNum(row['# bedrooms'] ?? row['bedrooms'] ?? row['beds'] ?? '');
        const bathsFull = toNum(row['baths - full'] ?? row['bathsfull'] ?? row['full baths'] ?? '');
        const bathsHalf = toNum(row['baths - 1/2'] ?? row['bathshalf'] ?? row['half baths'] ?? '');
        const yearBuilt = toNum(row['year built'] ?? row['yearbuilt'] ?? '');
        const subdivision = row['subdivision'] ?? '';
        const parish = row['parish'] ?? row['county'] ?? '';
        const mlsArea = row['area'] ?? '';
        const daysOnMarket = toNum(row['days on market'] ?? row['daysonmarket'] ?? row['dom'] ?? '');
        const soldTerms = row['sold terms'] ?? row['soldterms'] ?? '';

        // Transaction type
        const transactionType = sideType === 'listing' ? 'Listing' : 'Buyer';

        // Build transaction document
        const txDoc: Record<string, any> = {
          agentId: resolved.agentId,
          agentName: resolved.displayName,
          type: transactionType,
          status,
          address,
          listingDate: listingDate ?? null,
          closeDate: closeDate ?? null,
          soldDate: soldDate ?? null,
          cancelDate: cancelDate ?? null,
          underContractDate: underContractDate ?? null,
          endDate: endDate ?? null,
          backOnMarketDate: backOnMarketDate ?? null,
          projectedCloseDate: projectedCloseDate ?? null,
          listPrice: listPrice || null,
          salePrice: salePrice || null,
          originalListPrice: originalListPrice || null,
          year,
          propertyType: propertyType || null,
          sqft: sqft || null,
          bedrooms: bedrooms || null,
          bathsFull: bathsFull || null,
          bathsHalf: bathsHalf || null,
          yearBuilt: yearBuilt || null,
          subdivision: subdivision || null,
          parish: parish || null,
          mlsArea: mlsArea || null,
          daysOnMarket: daysOnMarket || null,
          soldTerms: soldTerms || null,
          mlsListNumber: mlsListNumber || null,
          mlsSideType: sideType,
          source: 'mls_import',
          importBatchId,
          importedAt: now,
          importedBy: decoded.uid,
          // No commission data — MLS doesn't provide this
          gci: null,
          commissionPct: null,
          splitSnapshot: null,
        };

        // Add co-agent if present
        if (coAgentId && coAgentName) {
          txDoc.coAgent1Id = coAgentId;
          txDoc.coAgent1Name = coAgentName;
        }

        const docRef = adminDb.collection('transactions').doc();
        batch.set(docRef, txDoc);
        batchCount++;

        // Track the list number so we don't double-import within this batch
        if (mlsListNumber) existingListNumbers.add(mlsListNumber);

        imported++;

        // Flush batch every MAX_BATCH writes
        if (batchCount >= MAX_BATCH) {
          await flushBatch();
        }
      } catch (err: any) {
        errors.push({ row: rowNum, error: err.message ?? 'Unknown error' });
        failed++;
      }
    }

    await flushBatch();

    // Identify former agents (inactive but matched)
    for (const [csvName, cached] of Object.entries(agentCache)) {
      const agent = allAgents.find(a => a.agentId === cached.agentId);
      if (agent && !agent.isActive && !cached.created) {
        formerAgents.push({ name: csvName, agentId: cached.agentId });
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      skippedDuplicates,
      skippedNoAgent,
      failed,
      errors: errors.slice(0, 50),
      importBatchId,
      autoCreatedAgents,
      formerAgents,
      fuzzyMatched,
      sideType,
      summary: {
        total: rows.length,
        imported,
        skippedDuplicates,
        skippedNoAgent,
        failed,
        autoCreatedAgents: autoCreatedAgents.length,
        formerAgents: formerAgents.length,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/admin/import-mls-listings]', err);
    return jsonError(500, 'Internal Server Error');
  }
}

// ── GET — return import batches ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return jsonError(401, 'Unauthorized');

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const ok = await isAdminLike(decoded.uid);
    if (!ok) return jsonError(403, 'Forbidden');

    const snap = await adminDb
      .collection('transactions')
      .where('source', '==', 'mls_import')
      .orderBy('importedAt', 'desc')
      .limit(500)
      .get();

    // Group by importBatchId
    const batches: Record<string, {
      importBatchId: string;
      sideType: string;
      importedAt: string;
      count: number;
      years: Set<number>;
    }> = {};

    for (const doc of snap.docs) {
      const d = doc.data();
      const bid = d.importBatchId ?? 'unknown';
      if (!batches[bid]) {
        batches[bid] = {
          importBatchId: bid,
          sideType: d.mlsSideType ?? 'listing',
          importedAt: d.importedAt ?? '',
          count: 0,
          years: new Set(),
        };
      }
      batches[bid].count++;
      if (d.year) batches[bid].years.add(d.year);
    }

    return NextResponse.json({
      ok: true,
      batches: Object.values(batches).map(b => ({
        ...b,
        years: Array.from(b.years).sort(),
      })),
    });
  } catch (err: any) {
    console.error('[GET /api/admin/import-mls-listings]', err);
    return jsonError(500, 'Internal Server Error');
  }
}
