import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function checkTiers(tiers: any[], label: string): string[] {
  if (!tiers || tiers.length === 0) return [];
  const issues: string[] = [];
  const sorted = [...tiers].sort((a, b) => (Number(a.fromCompanyDollar) || 0) - (Number(b.fromCompanyDollar) || 0));

  if (Number(sorted[0].fromCompanyDollar) !== 0) {
    issues.push(`${label}: First tier starts at $${sorted[0].fromCompanyDollar} instead of $0`);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const currentTo = current.toCompanyDollar;
    const nextFrom = Number(next.fromCompanyDollar || 0);

    if (currentTo === null || currentTo === undefined) {
      issues.push(`${label}: Tier "${current.tierName || `Tier ${i + 1}`}" has no cap (null) but tier "${next.tierName || `Tier ${i + 2}`}" follows it`);
    } else if (Number(currentTo) !== nextFrom) {
      issues.push(`${label}: Gap — tier "${current.tierName || `Tier ${i + 1}`}" ends at $${currentTo} but next tier "${next.tierName || `Tier ${i + 2}`}" starts at $${nextFrom}`);
    }
  }
  return issues;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/i);
    const token = match?.[1];
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const snap = await adminDb.collection('agentProfiles').get();
    const problems: { name: string; docId: string; email: string | null; agentType: string; teamRole: string | null; issues: string[] }[] = [];
    const clean: string[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const name = data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || doc.id;
      const allIssues: string[] = [];

      if (Array.isArray(data.tiers) && data.tiers.length > 0) {
        allIssues.push(...checkTiers(data.tiers, 'tiers'));
      }

      if (Array.isArray(data.teamMemberOverrideBands) && data.teamMemberOverrideBands.length > 0) {
        allIssues.push(...checkTiers(data.teamMemberOverrideBands, 'teamMemberOverrideBands'));
      }

      if (allIssues.length > 0) {
        problems.push({
          name,
          docId: doc.id,
          email: data.email || null,
          agentType: data.agentType || 'unknown',
          teamRole: data.teamRole || null,
          issues: allIssues,
        });
      } else {
        clean.push(name);
      }
    }

    return NextResponse.json({
      ok: true,
      totalProfiles: snap.size,
      problemCount: problems.length,
      cleanCount: clean.length,
      problems,
      clean,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
