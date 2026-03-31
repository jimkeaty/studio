// src/app/api/admin/agent-profiles/duplicates/route.ts
// GET — find potential duplicate agent profiles using fuzzy name matching
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { nameSimilarity } from '@/lib/agents/fuzzyMatch';
import { isAdminLike } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
    return NextResponse.json({ ok: false, error: 'Forbidden'
  }, { status: 403 });
    }

    const snap = await adminDb.collection('agentProfiles').get();
    const agents = snap.docs.map(doc => {
      const d = doc.data();
      return {
        agentId: String(d.agentId || doc.id),
        displayName: String(d.displayName || ''),
        firstName: String(d.firstName || ''),
        lastName: String(d.lastName || ''),
        source: d.source || null,
        status: d.status || 'active',
      };
    }).filter(a => a.displayName);

    // Find all pairs with similarity >= 0.75
    const THRESHOLD = 0.75;
    const duplicateGroups: Map<string, Set<string>> = new Map();

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const sim = nameSimilarity(agents[i].displayName, agents[j].displayName);
        if (sim >= THRESHOLD) {
          // Group them together
          const keyI = agents[i].agentId;
          const keyJ = agents[j].agentId;

          let groupKey: string | null = null;
          for (const [k, group] of duplicateGroups) {
            if (group.has(keyI) || group.has(keyJ)) {
              groupKey = k;
              break;
            }
          }

          if (groupKey) {
            duplicateGroups.get(groupKey)!.add(keyI);
            duplicateGroups.get(groupKey)!.add(keyJ);
          } else {
            duplicateGroups.set(keyI, new Set([keyI, keyJ]));
          }
        }
      }
    }

    // Build result
    const agentMap = new Map(agents.map(a => [a.agentId, a]));
    const groups = Array.from(duplicateGroups.values()).map(group => {
      const members = Array.from(group).map(id => {
        const a = agentMap.get(id)!;
        return {
          agentId: a.agentId,
          displayName: a.displayName,
          source: a.source,
          status: a.status,
        };
      });
      return members;
    });

    return NextResponse.json({
      ok: true,
      duplicateGroups: groups,
      totalGroups: groups.length,
    });
  } catch (err: any) {
    console.error('[api/admin/agent-profiles/duplicates GET]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
