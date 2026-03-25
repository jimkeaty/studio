// src/app/api/admin/agents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

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
    const email = decoded.email || '';

    if (email !== 'jim@keatyrealestate.com') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    const url = new URL(req.url);
    const source = url.searchParams.get('source') || 'profiles';

    if (source === 'profiles') {
      // Pull from agentProfiles — canonical list, no duplicates
      const snap = await adminDb.collection('agentProfiles')
        .where('status', '==', 'active')
        .limit(5000)
        .get();

      const agents: { agentId: string; agentName: string }[] = [];

      for (const doc of snap.docs) {
        const data = doc.data() || {};
        const agentId = doc.id || String(data.agentId || '').trim();
        if (!agentId) continue;

        const agentName =
          String(data.displayName || data.name || data.agentName || '').trim() ||
          agentId;

        agents.push({ agentId, agentName });
      }

      // Also include inactive profiles so we don't lose anyone
      const inactiveSnap = await adminDb.collection('agentProfiles')
        .where('status', 'in', ['inactive', 'onboarding'])
        .limit(5000)
        .get();

      for (const doc of inactiveSnap.docs) {
        const data = doc.data() || {};
        const agentId = doc.id || String(data.agentId || '').trim();
        if (!agentId) continue;
        // Skip if already in active list
        if (agents.some(a => a.agentId === agentId)) continue;

        const agentName =
          String(data.displayName || data.name || data.agentName || '').trim() ||
          agentId;

        agents.push({ agentId, agentName: `${agentName} (inactive)` });
      }

      agents.sort((a, b) => a.agentName.localeCompare(b.agentName));

      return NextResponse.json({ ok: true, source: 'profiles', count: agents.length, agents });
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
