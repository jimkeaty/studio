// GET  /api/competitions       — list competitions (optional ?status=active&year=2026)
// POST /api/competitions       — create a new competition
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { CompetitionConfig, Competition } from '@/lib/competitions/types';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

// ── GET: List competitions ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden');

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const yearParam = searchParams.get('year');

    let query: FirebaseFirestore.Query = adminDb.collection('competitions');

    if (status) {
      query = query.where('config.status', '==', status);
    }
    if (yearParam) {
      query = query.where('config.year', '==', Number(yearParam));
    }

    const snap = await query.get();
    const competitions: Competition[] = snap.docs.map((doc) => ({
      id: doc.id,
      config: doc.data().config as CompetitionConfig,
    }));

    return NextResponse.json({ ok: true, competitions });
  } catch (err: any) {
    console.error('[api/competitions GET]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── POST: Create competition ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden');

    const body = (await req.json()) as CompetitionConfig;

    // Validate required fields
    const missing: string[] = [];
    if (!body.name) missing.push('name');
    if (!body.theme) missing.push('theme');
    if (!body.metric) missing.push('metric');
    if (!body.startDate) missing.push('startDate');
    if (!body.endDate) missing.push('endDate');
    if (!body.scoringStrategy) missing.push('scoringStrategy');

    if (missing.length > 0) {
      return jsonError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    const now = new Date().toISOString();
    const config: CompetitionConfig = {
      // Identity
      name: body.name,
      description: body.description || '',
      theme: body.theme,

      // Timing
      startDate: body.startDate,
      endDate: body.endDate,
      year: body.year || new Date().getFullYear(),
      status: body.status || 'draft',

      // KPI
      metric: body.metric,
      metricLabel: body.metricLabel || '',
      targetType: body.targetType || 'daily',
      targetValue: body.targetValue ?? 0,

      // Scoring
      scoringStrategy: body.scoringStrategy,
      rankingDirection: body.rankingDirection || (body.scoringStrategy === 'threshold_map' ? 'asc' : 'desc'),
      thresholdRules: body.thresholdRules || [],

      // Points-based
      pointRules: body.pointRules || undefined,

      // Bonuses & Penalties
      bonuses: body.bonuses || {},
      penalties: body.penalties || {},

      // Prizes
      prizes: body.prizes || [],

      // Display
      leaderboardVariant: body.leaderboardVariant || 'standard',
      groupings: body.groupings || [],

      // Commentary & Audio
      commentaryPack: body.commentaryPack || 'generic',
      audioPack: body.audioPack || 'none',
      audioEnabled: body.audioEnabled ?? false,
      commentaryEnabled: body.commentaryEnabled ?? false,

      // Presentation
      autoRefreshSeconds: body.autoRefreshSeconds ?? 30,
      showTopN: body.showTopN ?? 20,
      tvLayout: body.tvLayout || 'full',

      // Metadata
      createdAt: now,
      updatedAt: now,
      createdBy: decoded.uid,
    };

    const ref = await adminDb.collection('competitions').add({ config });

    return NextResponse.json({
      ok: true,
      competition: { id: ref.id, config },
    });
  } catch (err: any) {
    console.error('[api/competitions POST]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
