// GET  /api/admin/recruiting-config        — read current config for the org
// PUT  /api/admin/recruiting-config        — create or update config for the org
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import type { RecruitingIncentiveConfig } from '@/lib/types/recruitingConfig';
import { DEFAULT_RECRUITING_CONFIG } from '@/lib/types/recruitingConfig';

const COLLECTION = 'recruitingIncentiveConfig';
// For now, Keaty is the single org. When multi-org is needed, derive orgId from the admin's profile.
const DEFAULT_ORG_ID = 'keaty';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireAdmin(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('orgId') || DEFAULT_ORG_ID;

    const snap = await adminDb.collection(COLLECTION).doc(orgId).get();
    if (!snap.exists) {
      // Return defaults — no config saved yet
      return NextResponse.json({
        ok: true,
        config: {
          id: orgId,
          ...DEFAULT_RECRUITING_CONFIG,
          updatedAt: null,
          updatedByUid: null,
        },
        isDefault: true,
      });
    }

    return NextResponse.json({
      ok: true,
      config: { id: snap.id, ...snap.data() } as RecruitingIncentiveConfig,
      isDefault: false,
    });
  } catch (e: any) {
    console.error('[api/admin/recruiting-config GET]', e?.message);
    return jsonError(500, 'Failed to load recruiting config');
  }
}

export async function PUT(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  try {
    const body = await req.json();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('orgId') || DEFAULT_ORG_ID;

    // Validate required fields
    const {
      programName,
      enabled,
      gciThreshold,
      tier1PayoutAmount,
      tier2PayoutAmount,
      tierDepth,
      windowType,
      windowMonths,
      recurring,
      description,
    } = body;

    if (typeof gciThreshold !== 'number' || gciThreshold < 0) {
      return jsonError(400, 'gciThreshold must be a non-negative number');
    }
    if (typeof tier1PayoutAmount !== 'number' || tier1PayoutAmount < 0) {
      return jsonError(400, 'tier1PayoutAmount must be a non-negative number');
    }
    if (typeof tier2PayoutAmount !== 'number' || tier2PayoutAmount < 0) {
      return jsonError(400, 'tier2PayoutAmount must be a non-negative number');
    }
    if (![1, 2].includes(tierDepth)) {
      return jsonError(400, 'tierDepth must be 1 or 2');
    }
    if (!['anniversary', 'calendar'].includes(windowType)) {
      return jsonError(400, 'windowType must be anniversary or calendar');
    }
    if (typeof windowMonths !== 'number' || windowMonths < 1 || windowMonths > 24) {
      return jsonError(400, 'windowMonths must be between 1 and 24');
    }

    const configDoc: Omit<RecruitingIncentiveConfig, 'id'> = {
      programName: String(programName || DEFAULT_RECRUITING_CONFIG.programName),
      enabled: Boolean(enabled ?? true),
      gciThreshold: Number(gciThreshold),
      tier1PayoutAmount: Number(tier1PayoutAmount),
      tier2PayoutAmount: Number(tier2PayoutAmount),
      tierDepth: tierDepth as 1 | 2,
      windowType: windowType as 'anniversary' | 'calendar',
      windowMonths: Number(windowMonths),
      recurring: Boolean(recurring ?? true),
      description: description ? String(description) : undefined,
      updatedAt: new Date().toISOString(),
      updatedByUid: decoded.uid,
    };

    await adminDb.collection(COLLECTION).doc(orgId).set(configDoc, { merge: true });

    return NextResponse.json({
      ok: true,
      config: { id: orgId, ...configDoc },
    });
  } catch (e: any) {
    console.error('[api/admin/recruiting-config PUT]', e?.message);
    return jsonError(500, 'Failed to save recruiting config');
  }
}
