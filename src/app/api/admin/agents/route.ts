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
 * IMPORTANT: We default to year=2025 because 2026 may not have data yet.
 * You can override with ?year=2025.
 */
export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email || '';

    // Keep admin rules consistent with link-agent:
    if (email !== 'jim@keatyrealestate.com') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    const url = new URL(req.url);

    const rawYear = url.searchParams.get('year') || '2025';
    const year = Number(rawYear);

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return jsonError(400, 'Invalid year');
    }


    // Pull from agentYearRollups for that year and build a distinct list.
    // We are intentionally defensive because your rollups may not all have agentName.
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

    return NextResponse.json({ ok: true, year, count: agents.length, agents });

  } catch (err: any) {
    console.error('[API/admin/agents] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', { message: err?.message || String(err) });
  }
}
