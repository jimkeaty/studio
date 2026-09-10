// src/app/api/admin/agents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { centralParts } from '@/lib/attendance/rules';
import { classifyAgentLifecycle } from '@/lib/agents/lifecycle';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

/**
 * Admin-only endpoint:
 * Returns a list of agents (id + name) to show in a dropdown.
 *
 * Primary source: agentProfiles (canonical, no duplicates)
 * Fallback: agentYearRollups for a given year (legacy)
 *
 * ?source=profiles  → use agentProfiles (default)
 * ?source=rollups&year=2025 → use agentYearRollups
 */
export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);

    if (!(await isAdminLike(decoded.uid))) {
    return jsonError(403, 'Forbidden: This action is restricted to administrators.');
  }

    const url = new URL(req.url);
    const source = url.searchParams.get('source') || 'profiles';
    const includeArchived = url.searchParams.get('includeArchived') === 'true';

    if (source === 'profiles') {
      // Pull from canonical profiles. Operational callers get Active only; the
      // Transaction Ledger explicitly opts into archived research results.
      const snap = await adminDb.collection('agentProfiles').limit(5000).get();
      const asOfDate = centralParts().date;
      const agents: Array<{ agentId: string; agentName: string; lifecycleStatus: 'active' | 'inactive' | 'out'; lifecycleDate: string | null }> = [];
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        const agentId = String(data.agentId || doc.id).trim();
        if (!agentId) continue;
        const lifecycle = classifyAgentLifecycle(data, asOfDate);
        if (!includeArchived && lifecycle.status !== 'active') continue;
        const displayName = String(data.displayName || data.name || data.agentName || '').trim() || agentId;
        agents.push({
          agentId,
          agentName: lifecycle.status === 'active' ? displayName : `${displayName} (${lifecycle.status === 'out' ? 'Out' : 'Inactive'})`,
          lifecycleStatus: lifecycle.status,
          lifecycleDate: lifecycle.applicableDate,
        });
      }

      // Exclude demo accounts from the roster
      // Build a set of demo agentIds to exclude
      const demoSnap = await adminDb.collection('agentProfiles').where('isDemoAccount', '==', true).get();
      const demoIds = new Set(demoSnap.docs.map(d => String(d.data().agentId || d.id)));
      const visibleAgents = agents.filter(a => !demoIds.has(a.agentId));

      visibleAgents.sort((a, b) => a.agentName.localeCompare(b.agentName));

      return NextResponse.json({ ok: true, source: 'profiles', includeArchived, asOfDate, count: visibleAgents.length, agents: visibleAgents });
    }

    // Fallback: agentYearRollups
    const rawYear = url.searchParams.get('year') || String(new Date().getFullYear());
    const year = Number(rawYear);

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return jsonError(400, 'Invalid year');
    }

    const snap = await adminDb.collection('agentYearRollups')
      .where('year', '==', year)
      .limit(5000)
      .get();

    const map = new Map<string, { agentId: string; agentName: string }>();

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const agentId = String(data.agentId || '').trim();
      if (!agentId) continue;

      const agentName =
        String(data.agentName || data.name || data.displayName || '').trim() ||
        agentId;

      if (!map.has(agentId)) {
        map.set(agentId, { agentId, agentName });
      }
    }

    const agents = Array.from(map.values()).sort((a, b) =>
      a.agentName.localeCompare(b.agentName)
    );

    return NextResponse.json({ ok: true, source: 'rollups', year, count: agents.length, agents });

  } catch (err: any) {
    console.error('[API/admin/agents] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', { message: err?.message || String(err) });
  }
}
