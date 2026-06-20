// src/app/api/onboarding/route.ts
// GET  /api/onboarding  — returns onboarding state + resolved role for the current user
// POST /api/onboarding  — marks onboarding complete (or resets it)
//
// Firestore layout:
//   onboardingState/{uid}  →  { complete, wizardRole, completedAt, skippedAt }
//
// wizardRole values:
//   'broker'      — admin/super-admin/office_admin (full setup wizard + branding)
//   'solo_agent'  — agent with isSoloAgent:true OR no brokerage agentProfiles record
//   'agent'       — agent inside a brokerage (guided tour wizard, no branding)
//   'team_leader' — teamRole === 'leader' (full setup wizard, team branding)
//   'staff'       — TC / staff user (short profile wizard)

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const SUPER_ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

type WizardRole = 'broker' | 'solo_agent' | 'agent' | 'team_leader' | 'staff';

async function resolveWizardRole(uid: string, email: string | null): Promise<WizardRole> {
  // Super admin → broker
  if (uid === SUPER_ADMIN_UID) return 'broker';

  // Check staff roles first
  try {
    const staffSnap = await adminDb
      .collection('staffUsers')
      .where('firebaseUid', '==', uid)
      .limit(1)
      .get();

    if (!staffSnap.empty) {
      const staffData = staffSnap.docs[0].data();
      const role = staffData.role ?? '';
      if (role === 'office_admin' || role === 'tc_admin') return 'broker';
      if (role === 'tc') return 'staff';
    }

    // Also check by email
    if (email && staffSnap.empty) {
      const staffByEmail = await adminDb
        .collection('staffUsers')
        .where('email', '==', email)
        .limit(1)
        .get();
      if (!staffByEmail.empty) {
        const role = staffByEmail.docs[0].data().role ?? '';
        if (role === 'office_admin' || role === 'tc_admin') return 'broker';
        if (role === 'tc') return 'staff';
      }
    }
  } catch {
    // ignore — fall through to agent check
  }

  // Check agentProfiles
  let agentData: Record<string, any> | null = null;
  try {
    // Strategy 1: doc ID
    let snap = await adminDb.collection('agentProfiles').doc(uid).get();
    if (!snap.exists && email) {
      const q = await adminDb.collection('agentProfiles').where('email', '==', email).limit(1).get();
      if (!q.empty) snap = q.docs[0] as any;
    }
    if (!snap.exists) {
      const q = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
      if (!q.empty) snap = q.docs[0] as any;
    }
    if (snap.exists) agentData = snap.data() as Record<string, any>;
  } catch {
    // ignore
  }

  if (!agentData) {
    // No agent profile found — treat as solo agent (self-signup)
    return 'solo_agent';
  }

  // Team leader check
  if (agentData.teamRole === 'leader' && agentData.primaryTeamId) {
    return 'team_leader';
  }

  // Solo agent flag
  if (agentData.isSoloAgent === true || agentData.accountType === 'solo') {
    return 'solo_agent';
  }

  // Regular brokerage agent
  return 'agent';
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email ?? null;

    // Read onboarding state
    const stateSnap = await adminDb.collection('onboardingState').doc(uid).get();
    const state = stateSnap.exists ? (stateSnap.data() as Record<string, any>) : null;

    // Resolve wizard role (always fresh — role can change)
    const wizardRole = await resolveWizardRole(uid, email);

    return NextResponse.json({
      ok: true,
      complete: state?.complete === true,
      skipped: state?.skipped === true,
      wizardRole,
      completedAt: state?.completedAt ?? null,
      skippedAt: state?.skippedAt ?? null,
    });
  } catch (err: any) {
    console.error('[GET /api/onboarding]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'complete'; // 'complete' | 'skip' | 'reset'

    const now = new Date().toISOString();
    let update: Record<string, any> = {};

    if (action === 'complete') {
      update = { complete: true, skipped: false, completedAt: now };
    } else if (action === 'skip') {
      update = { complete: false, skipped: true, skippedAt: now };
    } else if (action === 'reset') {
      update = { complete: false, skipped: false, completedAt: null, skippedAt: null };
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await adminDb.collection('onboardingState').doc(uid).set(update, { merge: true });

    return NextResponse.json({ ok: true, action });
  } catch (err: any) {
    console.error('[POST /api/onboarding]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
