// GET /api/admin/debug-agent?name=noah — comprehensive agent diagnostic
// Checks profile fields, Firebase Auth record, transactions, daily_activity, goals,
// and simulates all 4 profile resolution strategies to pinpoint why data isn't loading.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const isAdmin = await isAdminLike(decoded.uid);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const name = (searchParams.get('name') || '').toLowerCase();
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

    if (!name) {
      return NextResponse.json({ error: 'name param required' }, { status: 400 });
    }

    // 1. Find matching profiles
    const allProfiles = await adminDb.collection('agentProfiles').get();
    const matchingProfiles = allProfiles.docs.filter(d => {
      const data = d.data();
      const n = (data.name || data.displayName || '').toLowerCase();
      const slug = (data.agentId || '').toLowerCase();
      const docId = d.id.toLowerCase();
      return n.includes(name) || slug.includes(name) || docId.includes(name);
    });

    if (matchingProfiles.length === 0) {
      return NextResponse.json({ ok: true, year, agentCount: 0, results: [], message: `No profiles found matching "${name}"` });
    }

    const results = await Promise.all(matchingProfiles.map(async (profileDoc) => {
      const p = profileDoc.data();
      const docId = profileDoc.id;

      // Collect all possible IDs for this agent
      const allIds = new Set<string>([docId]);
      if (p.agentId) allIds.add(String(p.agentId));
      if (p.firebaseUid) allIds.add(String(p.firebaseUid));
      const idList = Array.from(allIds);

      // Check Firebase Auth by email
      let firebaseAuthRecord: any = null;
      let firebaseAuthError: string | null = null;
      if (p.email) {
        try {
          const authUser = await adminAuth.getUserByEmail(p.email);
          firebaseAuthRecord = {
            uid: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName,
            disabled: authUser.disabled,
            emailVerified: authUser.emailVerified,
            providerData: authUser.providerData?.map(pr => pr.providerId),
          };
        } catch (e: any) {
          firebaseAuthError = e.message;
        }
      }

      // If we found the auth record, add its UID to the search set too
      if (firebaseAuthRecord?.uid && !allIds.has(firebaseAuthRecord.uid)) {
        allIds.add(firebaseAuthRecord.uid);
      }
      const fullIdList = Array.from(allIds);

      // Check transactions for each possible ID
      const txCounts: Record<string, number> = {};
      for (const id of fullIdList) {
        try {
          const snap = await adminDb.collection('transactions')
            .where('agentId', '==', id)
            .where('year', '==', year)
            .get();
          txCounts[id] = snap.size;
        } catch (e: any) {
          txCounts[id] = -1; // error
        }
      }

      // Check all-year transaction counts
      const txAllYearCounts: Record<string, number> = {};
      for (const id of fullIdList) {
        try {
          const snap = await adminDb.collection('transactions')
            .where('agentId', '==', id)
            .get();
          txAllYearCounts[id] = snap.size;
        } catch (e: any) {
          txAllYearCounts[id] = -1;
        }
      }

      // Check daily_activity for each possible ID
      const activityCounts: Record<string, number> = {};
      for (const id of fullIdList) {
        try {
          const snap = await adminDb.collection('daily_activity')
            .where('agentId', '==', id)
            .where('date', '>=', `${year}-01-01`)
            .where('date', '<=', `${year}-12-31`)
            .get();
          activityCounts[id] = snap.size;
        } catch (e: any) {
          activityCounts[id] = -1;
        }
      }

      // Check goals for each possible segment
      const possibleSegments = fullIdList.map(id => `agent_${id}`);
      const goalCounts: Record<string, number> = {};
      for (const seg of possibleSegments) {
        try {
          const snap = await adminDb.collection('brokerCommandGoals')
            .where('year', '==', year)
            .where('segment', '==', seg)
            .get();
          goalCounts[seg] = snap.size;
        } catch (e: any) {
          goalCounts[seg] = -1;
        }
      }

      // Check business plan
      let businessPlanExists = false;
      let businessPlanPath = '';
      for (const id of fullIdList) {
        try {
          const planRef = adminDb.collection('businessPlans').doc(id).collection('years').doc(String(year));
          const planSnap = await planRef.get();
          if (planSnap.exists) {
            businessPlanExists = true;
            businessPlanPath = `businessPlans/${id}/years/${year}`;
            break;
          }
        } catch { /* ignore */ }
      }

      // Resolution strategy simulation
      const strategies: Record<string, string> = {};
      if (firebaseAuthRecord) {
        const authUid = firebaseAuthRecord.uid;
        strategies.strategy1_docId = docId === authUid ? '✅ MATCH' : `❌ NO MATCH (docId=${docId}, authUid=${authUid})`;
        strategies.strategy2_agentId = p.agentId === authUid ? '✅ MATCH' : `❌ NO MATCH (agentId=${p.agentId}, authUid=${authUid})`;
        strategies.strategy3_email = p.email === firebaseAuthRecord.email ? '✅ MATCH' : `❌ NO MATCH (profileEmail=${p.email}, authEmail=${firebaseAuthRecord.email})`;
        strategies.strategy4_firebaseUid = p.firebaseUid === authUid ? '✅ MATCH' : `❌ NO MATCH (profile.firebaseUid=${p.firebaseUid || 'MISSING'}, authUid=${authUid})`;
      } else {
        strategies.note = 'Cannot simulate — no Firebase Auth record found for this email';
      }

      // Determine which strategy would succeed
      let firstSuccessfulStrategy = 'NONE';
      if (firebaseAuthRecord) {
        const authUid = firebaseAuthRecord.uid;
        if (docId === authUid) firstSuccessfulStrategy = 'Strategy 1 (docId == authUid)';
        else if (p.agentId === authUid) firstSuccessfulStrategy = 'Strategy 2 (agentId == authUid)';
        else if (p.email === firebaseAuthRecord.email) firstSuccessfulStrategy = 'Strategy 3 (email match)';
        else if (p.firebaseUid === authUid) firstSuccessfulStrategy = 'Strategy 4 (firebaseUid field)';
      }

      const profileFound = firstSuccessfulStrategy !== 'NONE';
      const hasTransactions = Object.values(txCounts).some(c => c > 0);
      const hasAnyTransactions = Object.values(txAllYearCounts).some(c => c > 0);

      // Build fix recommendation
      let fixRecommendation = '';
      if (!firebaseAuthRecord) {
        fixRecommendation = '🔧 FIX: No Firebase Auth account found. Run Bulk Invite to create one.';
      } else if (!profileFound) {
        const authUid = firebaseAuthRecord.uid;
        fixRecommendation = `🔧 FIX: Update profile doc "${docId}" — set firebaseUid field to "${authUid}". Then re-run backfill-agent-uids or manually update in Firestore console.`;
      } else if (!hasTransactions && hasAnyTransactions) {
        // Find which ID has transactions
        const idWithTx = Object.entries(txAllYearCounts).find(([, c]) => c > 0)?.[0];
        const resolvedId = firstSuccessfulStrategy.includes('Strategy 1') ? docId
          : firstSuccessfulStrategy.includes('Strategy 2') ? p.agentId
          : firstSuccessfulStrategy.includes('Strategy 3') ? docId
          : p.firebaseUid;
        fixRecommendation = `🔧 FIX: Transactions are stored under agentId="${idWithTx}" but profile resolves to "${resolvedId}". The dashboard queries multiple IDs so this should work — but check if transactions have the correct year=${year} field.`;
      } else if (!hasTransactions && !hasAnyTransactions) {
        fixRecommendation = `⚠️ No transactions found under any ID. Either no data has been imported for this agent, or transactions use a completely different agentId value.`;
      } else {
        fixRecommendation = '✅ Everything looks correct. Profile resolves and transactions exist.';
      }

      return {
        profile: {
          docId,
          name: p.name || p.displayName,
          email: p.email,
          agentId: p.agentId,
          firebaseUid: p.firebaseUid,
          status: p.status,
          role: p.role,
          allFieldNames: Object.keys(p).sort(),
        },
        firebaseAuth: firebaseAuthRecord,
        firebaseAuthError,
        allPossibleIds: fullIdList,
        transactionCountsByIdThisYear: txCounts,
        transactionCountsByIdAllYears: txAllYearCounts,
        activityCountsByIdThisYear: activityCounts,
        goalCountsBySegment: goalCounts,
        businessPlan: { exists: businessPlanExists, path: businessPlanPath },
        resolutionStrategies: strategies,
        firstSuccessfulStrategy,
        profileDiagnosis: profileFound
          ? `✅ Profile found via: ${firstSuccessfulStrategy}`
          : '🚨 CRITICAL: Profile would NOT be found for this agent\'s login!',
        dataDiagnosis: hasTransactions
          ? `✅ ${Object.values(txCounts).reduce((a, b) => a + Math.max(0, b), 0)} transactions found for year ${year}`
          : hasAnyTransactions
            ? `⚠️ Transactions exist in other years but NOT year ${year}`
            : `🚨 NO transactions found under any ID (all years)`,
        fixRecommendation,
      };
    }));

    return NextResponse.json({ ok: true, year, agentCount: results.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
