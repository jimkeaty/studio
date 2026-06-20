// POST /api/admin/import/resolve-agents
// Pre-import agent resolution step.
// Accepts a list of agent names from the CSV and returns a structured report:
//   - auto_resolved: exact match to an active agent (no action needed)
//   - fuzzy_match:   near-match (80–95%) to an active agent — needs human confirmation
//   - former_agent:  exact or near-match to an inactive/terminated agent — needs decision
//   - no_match:      no match found — needs decision (create / pick existing / skip)
//
// The client uses this report to show the Agent Review step before committing the import.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { findFuzzyMatches, nameSimilarity } from '@/lib/agents/fuzzyMatch';

// Agent statuses that mean the person has left the brokerage
const INACTIVE_STATUSES = new Set([
  'inactive', 'out', 'terminated', 'churned', 'resigned',
  'released', 'former', 'left', 'departed',
]);

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export type AgentResolutionStatus =
  | 'auto_resolved'   // exact match, active agent — no action needed
  | 'fuzzy_match'     // near-match to active agent — confirm or override
  | 'former_agent'    // matched to inactive/terminated agent — decide how to handle
  | 'no_match';       // no match at all — create / pick / skip

export interface AgentResolution {
  csvName: string;                  // name as it appears in the CSV
  status: AgentResolutionStatus;
  // For auto_resolved / fuzzy_match / former_agent:
  matchedAgentId?: string;
  matchedDisplayName?: string;
  matchedAgentStatus?: string;      // e.g. 'inactive', 'terminated'
  similarity?: number;              // 0–100
  // For fuzzy_match: top 3 candidates the user can choose from
  candidates?: {
    agentId: string;
    displayName: string;
    agentStatus: string;
    similarity: number;
  }[];
  // Row numbers in the CSV that use this agent name
  rowNumbers: number[];
}

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden');

    const body = await req.json();
    // agentNames: Array<{ name: string; rows: number[] }>
    // (unique names extracted from the CSV, with which row numbers they appear on)
    const agentNames: { name: string; rows: number[] }[] = body.agentNames ?? [];

    if (!Array.isArray(agentNames) || agentNames.length === 0) {
      return NextResponse.json({ ok: true, resolutions: [] });
    }

    // Load all agent profiles
    const profilesSnap = await adminDb.collection('agentProfiles').get();
    const allAgents: {
      agentId: string;
      displayName: string;
      agentStatus: string;
      isInactive: boolean;
    }[] = [];

    for (const doc of profilesSnap.docs) {
      const d = doc.data();
      const agentId = String(d.agentId || doc.id).trim();
      const displayName = String(d.displayName || '').trim();
      if (!agentId || !displayName) continue;
      const rawStatus = String(d.status || d.agentStatus || 'active').toLowerCase();
      const isInactive = INACTIVE_STATUSES.has(rawStatus);
      allAgents.push({ agentId, displayName, agentStatus: rawStatus, isInactive });
    }

    const activeAgents = allAgents.filter(a => !a.isInactive);
    const inactiveAgents = allAgents.filter(a => a.isInactive);

    const resolutions: AgentResolution[] = [];

    for (const { name, rows } of agentNames) {
      const nameTrimmed = name.trim();
      if (!nameTrimmed) continue;

      const nameLower = nameTrimmed.toLowerCase();

      // ── 1. Exact match against active agents ──────────────────────────────
      const exactActive = activeAgents.find(
        a => a.displayName.toLowerCase() === nameLower
      );
      if (exactActive) {
        resolutions.push({
          csvName: nameTrimmed,
          status: 'auto_resolved',
          matchedAgentId: exactActive.agentId,
          matchedDisplayName: exactActive.displayName,
          matchedAgentStatus: exactActive.agentStatus,
          similarity: 100,
          rowNumbers: rows,
        });
        continue;
      }

      // ── 2. Exact match against inactive/former agents ─────────────────────
      const exactInactive = inactiveAgents.find(
        a => a.displayName.toLowerCase() === nameLower
      );
      if (exactInactive) {
        // Also check if there's a similarly-named active agent (e.g. same name, different person)
        const activeAlternatives = findFuzzyMatches(nameTrimmed, activeAgents, 0.75)
          .slice(0, 3)
          .map(m => {
            const agent = activeAgents.find(a => a.agentId === m.agentId)!;
            return {
              agentId: m.agentId,
              displayName: m.displayName,
              agentStatus: agent.agentStatus,
              similarity: Math.round(m.similarity * 100),
            };
          });
        resolutions.push({
          csvName: nameTrimmed,
          status: 'former_agent',
          matchedAgentId: exactInactive.agentId,
          matchedDisplayName: exactInactive.displayName,
          matchedAgentStatus: exactInactive.agentStatus,
          similarity: 100,
          candidates: activeAlternatives,
          rowNumbers: rows,
        });
        continue;
      }

      // ── 3. Fuzzy match against active agents (80–100%) ────────────────────
      const fuzzyActive = findFuzzyMatches(nameTrimmed, activeAgents, 0.80)
        .slice(0, 3);

      if (fuzzyActive.length > 0) {
        const best = fuzzyActive[0];
        const bestAgent = activeAgents.find(a => a.agentId === best.agentId)!;
        resolutions.push({
          csvName: nameTrimmed,
          status: 'fuzzy_match',
          matchedAgentId: best.agentId,
          matchedDisplayName: best.displayName,
          matchedAgentStatus: bestAgent.agentStatus,
          similarity: Math.round(best.similarity * 100),
          candidates: fuzzyActive.map(m => {
            const agent = activeAgents.find(a => a.agentId === m.agentId)!;
            return {
              agentId: m.agentId,
              displayName: m.displayName,
              agentStatus: agent.agentStatus,
              similarity: Math.round(m.similarity * 100),
            };
          }),
          rowNumbers: rows,
        });
        continue;
      }

      // ── 4. Fuzzy match against inactive agents (80–100%) ─────────────────
      const fuzzyInactive = findFuzzyMatches(nameTrimmed, inactiveAgents, 0.80)
        .slice(0, 3);

      if (fuzzyInactive.length > 0) {
        const best = fuzzyInactive[0];
        const bestAgent = inactiveAgents.find(a => a.agentId === best.agentId)!;
        resolutions.push({
          csvName: nameTrimmed,
          status: 'former_agent',
          matchedAgentId: best.agentId,
          matchedDisplayName: best.displayName,
          matchedAgentStatus: bestAgent.agentStatus,
          similarity: Math.round(best.similarity * 100),
          candidates: fuzzyInactive.map(m => {
            const agent = inactiveAgents.find(a => a.agentId === m.agentId)!;
            return {
              agentId: m.agentId,
              displayName: m.displayName,
              agentStatus: agent.agentStatus,
              similarity: Math.round(m.similarity * 100),
            };
          }),
          rowNumbers: rows,
        });
        continue;
      }

      // ── 5. No match at all ────────────────────────────────────────────────
      resolutions.push({
        csvName: nameTrimmed,
        status: 'no_match',
        rowNumbers: rows,
        // Provide all active agents as searchable options for manual assignment
        candidates: [],
      });
    }

    // Summary counts
    const summary = {
      total: resolutions.length,
      autoResolved: resolutions.filter(r => r.status === 'auto_resolved').length,
      needsReview: resolutions.filter(r => r.status !== 'auto_resolved').length,
      fuzzyMatches: resolutions.filter(r => r.status === 'fuzzy_match').length,
      formerAgents: resolutions.filter(r => r.status === 'former_agent').length,
      noMatches: resolutions.filter(r => r.status === 'no_match').length,
    };

    return NextResponse.json({
      ok: true,
      summary,
      resolutions,
      // Also return all active agents so the UI can offer a searchable dropdown
      activeAgents: activeAgents.map(a => ({
        agentId: a.agentId,
        displayName: a.displayName,
      })),
    });
  } catch (err: any) {
    console.error('[POST /api/admin/import/resolve-agents]', err);
    return jsonError(500, 'Internal Server Error');
  }
}
