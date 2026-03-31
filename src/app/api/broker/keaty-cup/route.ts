// GET  /api/broker/keaty-cup  — race standings, points, events
// POST /api/broker/keaty-cup  — save race rules / prize config
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function num(v: any): number { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }
function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}
function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}

// ── Default scoring rules ────────────────────────────────────────────────────
const DEFAULT_RULES = {
  closedDeal: 100,
  pendingDeal: 50,
  engagementPoint: 1,
  appointmentHeldPoint: 5,
  contractWrittenPoint: 25,
  cancelledDeal: -50,         // "Flat Tire"
  bigClosingBonus: 50,        // volume > threshold
  bigClosingThreshold: 500000,
  monthlyGoalHitBonus: 75,    // "Checkered Flag"
  firstDealOfMonthBonus: 25,  // "Green Flag"
  prizes: [
    { place: 1, label: '1st Place', amount: 1000 },
    { place: 2, label: '2nd Place', amount: 500 },
    { place: 3, label: '3rd Place', amount: 250 },
  ],
  seasonName: 'Keaty Cup 2026',
  seasonYear: 2026,
};

export type RaceEvent = {
  type: 'flat_tire' | 'turbo_boost' | 'green_flag' | 'checkered_flag' | 'pit_stop' | 'caution';
  label: string;
  emoji: string;
  points: number;
  date: string;
  detail: string;
};

export type RacerStanding = {
  agentId: string;
  displayName: string;
  teamName: string | null;
  carNumber: number;
  carColor: string;
  position: number;
  points: number;
  closedDeals: number;
  pendingDeals: number;
  cancelledDeals: number;
  closedVolume: number;
  engagements: number;
  appointmentsHeld: number;
  events: RaceEvent[];
  lapProgress: number;       // 0-100 position on track
  pointsBehindLeader: number;
  streak: number;            // consecutive months with a closing
};

const CAR_COLORS = [
  '#e11d48','#2563eb','#16a34a','#d97706','#7c3aed',
  '#0891b2','#db2777','#65a30d','#ea580c','#6366f1',
  '#0d9488','#c026d3','#ca8a04','#dc2626','#2dd4bf',
  '#f97316','#8b5cf6','#14b8a6','#f43f5e','#3b82f6',
];

export async function GET(req: NextRequest) {
  try {
    const token = bearer(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    await adminAuth.verifyIdToken(token); // any authenticated user can view Keaty Cup standings

    const { searchParams } = new URL(req.url);
    const yearNum = Number(searchParams.get('year')) || new Date().getFullYear();

    // Load saved rules or use defaults
    const rulesDoc = await adminDb.collection('keatyCupRules').doc(String(yearNum)).get();
    const rules = rulesDoc.exists ? { ...DEFAULT_RULES, ...rulesDoc.data() } : DEFAULT_RULES;

    // ── Fetch agents ──────────────────────────────────────────────────────
    const profileSnap = await adminDb.collection('agentProfiles').where('status', 'in', ['active', 'grace_period']).get();
    const agents: any[] = [];
    for (const doc of profileSnap.docs) {
      const d = doc.data();
      agents.push({ id: doc.id, ...d });
    }

    // ── Fetch transactions ────────────────────────────────────────────────
    const txSnap = await adminDb.collection('transactions').where('year', '==', yearNum).limit(5000).get();
    const txByAgent = new Map<string, any[]>();
    for (const doc of txSnap.docs) {
      const t = { id: doc.id, ...doc.data() };
      const aid = (t as any).agentId;
      if (!aid) continue;
      if (!txByAgent.has(aid)) txByAgent.set(aid, []);
      txByAgent.get(aid)!.push(t);
    }

    // ── Fetch daily activity ──────────────────────────────────────────────
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const endYmd = todayUtc.toISOString().slice(0, 10);
    const actSnap = await adminDb.collection('daily_activity')
      .where('date', '>=', `${yearNum}-01-01`)
      .where('date', '<=', endYmd)
      .limit(5000)
      .get();

    const actByAgent = new Map<string, { eng: number; apptHeld: number; contracts: number }>();
    for (const doc of actSnap.docs) {
      const a = doc.data();
      const aid = a.agentId;
      if (!aid) continue;
      if (!actByAgent.has(aid)) actByAgent.set(aid, { eng: 0, apptHeld: 0, contracts: 0 });
      const b = actByAgent.get(aid)!;
      b.eng += num(a.engagementsCount);
      b.apptHeld += num(a.appointmentsHeldCount);
      b.contracts += num(a.contractsWrittenCount);
    }

    // ── Build standings ───────────────────────────────────────────────────
    const standings: RacerStanding[] = [];

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const uid = agent.agentId || agent.id;
      const txs = txByAgent.get(uid) || [];
      const act = actByAgent.get(uid) || { eng: 0, apptHeld: 0, contracts: 0 };

      let points = 0;
      let closedDeals = 0;
      let pendingDeals = 0;
      let cancelledDeals = 0;
      let closedVolume = 0;
      const events: RaceEvent[] = [];
      const closedMonths = new Set<number>();

      for (const t of txs) {
        const status = String(t.status || '').trim();
        const dealValue = num(t.dealValue);
        const closedDate = toDate(t.closedDate || t.closingDate);
        const contractDate = toDate(t.contractDate);
        const txDate = closedDate || contractDate;
        const dateStr = txDate ? txDate.toISOString().slice(0, 10) : '';

        if (status === 'closed') {
          closedDeals += 1;
          closedVolume += dealValue;
          points += rules.closedDeal;

          if (closedDate) {
            const mo = closedDate.getMonth();
            // First deal of the month bonus
            if (!closedMonths.has(mo)) {
              closedMonths.add(mo);
              points += rules.firstDealOfMonthBonus;
              events.push({
                type: 'green_flag', label: 'Green Flag', emoji: '🟢',
                points: rules.firstDealOfMonthBonus, date: dateStr,
                detail: `First closing of ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo]}`,
              });
            }
          }

          // Big closing bonus
          if (dealValue >= rules.bigClosingThreshold) {
            points += rules.bigClosingBonus;
            events.push({
              type: 'turbo_boost', label: 'Turbo Boost', emoji: '🚀',
              points: rules.bigClosingBonus, date: dateStr,
              detail: `Big closing: $${(dealValue / 1000).toFixed(0)}k at ${t.address || 'N/A'}`,
            });
          }
        } else if (status === 'pending' || status === 'under_contract') {
          pendingDeals += 1;
          points += rules.pendingDeal;
        } else if (status === 'cancelled') {
          cancelledDeals += 1;
          points += rules.cancelledDeal; // negative
          events.push({
            type: 'flat_tire', label: 'Flat Tire', emoji: '💥',
            points: rules.cancelledDeal, date: dateStr,
            detail: `Deal fell through: ${t.address || 'N/A'}`,
          });
        }
      }

      // Activity points
      points += act.eng * rules.engagementPoint;
      points += act.apptHeld * rules.appointmentHeldPoint;
      points += act.contracts * rules.contractWrittenPoint;

      // Streak: consecutive months with at least 1 closing (from most recent month backward)
      let streak = 0;
      const currentMonth = todayUtc.getUTCMonth();
      for (let m = currentMonth; m >= 0; m--) {
        if (closedMonths.has(m)) streak += 1;
        else break;
      }

      // Check for pit stop (no recent activity in last 7 days)
      // We'll approximate: if 0 engagements and 0 closed/pending and it's past Jan
      if (act.eng === 0 && closedDeals === 0 && pendingDeals === 0 && todayUtc.getUTCMonth() > 0) {
        events.push({
          type: 'pit_stop', label: 'Pit Stop', emoji: '🔧',
          points: 0, date: endYmd,
          detail: 'No activity or deals recorded this year',
        });
      }

      standings.push({
        agentId: uid,
        displayName: agent.displayName || agent.name || uid,
        teamName: agent.teamName || null,
        carNumber: i + 1,
        carColor: CAR_COLORS[i % CAR_COLORS.length],
        position: 0, // calculated after sort
        points: Math.max(0, points),
        closedDeals,
        pendingDeals,
        cancelledDeals,
        closedVolume,
        engagements: act.eng,
        appointmentsHeld: act.apptHeld,
        events: events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
        lapProgress: 0, // calculated after sort
        pointsBehindLeader: 0,
        streak,
      });
    }

    // Sort by points (desc), then closed deals, then volume
    standings.sort((a, b) => b.points - a.points || b.closedDeals - a.closedDeals || b.closedVolume - a.closedVolume);

    const leaderPoints = standings[0]?.points || 1;
    for (let i = 0; i < standings.length; i++) {
      standings[i].position = i + 1;
      standings[i].pointsBehindLeader = leaderPoints - standings[i].points;
      // Lap progress: leader is at 95%, others proportionally behind
      standings[i].lapProgress = leaderPoints > 0
        ? Math.max(5, (standings[i].points / leaderPoints) * 95)
        : 5;
    }

    return NextResponse.json(serializeFirestore({
      ok: true,
      year: yearNum,
      standings,
      rules,
      totalRacers: standings.length,
      seasonName: rules.seasonName,
    }));
  } catch (err: any) {
    console.error('[keaty-cup]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST: Save rules ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = bearer(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const year = num(body.year) || new Date().getFullYear();
    const rules = body.rules || {};

    await adminDb.collection('keatyCupRules').doc(String(year)).set({
      ...rules,
      updatedAt: new Date(),
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[keaty-cup POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
