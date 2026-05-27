import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

async function requireAdmin(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) throw new Error('UNAUTHORIZED');
  const decoded = await adminAuth.verifyIdToken(token);
  if (!(await isAdminLike(decoded.uid))) throw new Error('FORBIDDEN');
  return decoded;
}

/**
 * Determines whether an active agent profile has a valid saved commission structure.
 *
 * Rules:
 *  - Independent agents / team leaders: must have data.tiers with at least one entry
 *    that has agentSplitPercent > 0, OR commissionMode === 'flat' with flatAgentPercent > 0.
 *  - Team members: must have data.teamMemberOverrideBands with at least one entry
 *    that has memberPercent > 0.
 */
function getMissingReason(data: Record<string, any>): string | null {
  const agentType = data.agentType || 'independent';
  const teamRole = data.teamRole || null;
  const commissionMode = data.commissionMode || 'team_default';

  // Flat plan — check flatAgentPercent
  if (commissionMode === 'flat') {
    const flatPct = Number(data.flatAgentPercent ?? 0);
    if (flatPct > 0) return null; // OK
    return 'Flat commission plan saved but flatAgentPercent is 0 or missing';
  }

  // Team member — check teamMemberOverrideBands
  if (agentType === 'team' && teamRole === 'member') {
    const bands: any[] = Array.isArray(data.teamMemberOverrideBands)
      ? data.teamMemberOverrideBands
      : [];
    const hasValidBand = bands.some((b) => Number(b?.memberPercent ?? 0) > 0);
    if (hasValidBand) return null; // OK
    return 'Team member has no saved commission bands (teamMemberOverrideBands is empty or all zero)';
  }

  // Independent or team leader — check tiers
  const tiers: any[] = Array.isArray(data.tiers) ? data.tiers : [];
  const hasValidTier = tiers.some((t) => Number(t?.agentSplitPercent ?? 0) > 0);
  if (hasValidTier) return null; // OK
  return 'No saved commission tiers (tiers is empty or all agentSplitPercent are 0)';
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    // Fetch all ACTIVE agent profiles
    const snap = await adminDb
      .collection('agentProfiles')
      .where('status', '==', 'active')
      .get();

    const flagged: {
      agentId: string;
      displayName: string;
      agentType: string;
      teamRole: string | null;
      teamGroup: string | null;
      primaryTeamId: string | null;
      commissionMode: string;
      reason: string;
    }[] = [];

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, any>;
      const reason = getMissingReason(data);
      if (reason) {
        flagged.push({
          agentId: doc.id,
          displayName: data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          agentType: data.agentType || 'independent',
          teamRole: data.teamRole || null,
          teamGroup: data.teamGroup || null,
          primaryTeamId: data.primaryTeamId || null,
          commissionMode: data.commissionMode || 'team_default',
          reason,
        });
      }
    }

    // Sort alphabetically by display name
    flagged.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({
      ok: true,
      totalActive: snap.size,
      flaggedCount: flagged.length,
      flagged,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') return jsonError(401, 'Unauthorized');
    if (err?.message === 'FORBIDDEN') return jsonError(403, 'Forbidden');
    console.error('[commission-audit] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', { message: err?.message || String(err) });
  }
}
