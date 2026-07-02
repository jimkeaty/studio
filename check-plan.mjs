import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection('brokerBusinessPlans').doc('2026').get();
if (!snap.exists) {
  console.log('No 2026 brokerBusinessPlans doc found');
} else {
  const d = snap.data();
  console.log('=== brokerBusinessPlans/2026 ===');
  console.log('netMarginGoal:', d.netMarginGoal);
  console.log('avgSalePrice:', d.avgSalePrice);
  console.log('avgCommissionPct:', d.avgCommissionPct);
  console.log('companyRetentionPct:', d.companyRetentionPct);
  console.log('attritionPct:', d.attritionPct);
  console.log('avgDealsPerAgentPerMonth:', d.avgDealsPerAgentPerMonth);
}

const rSnap = await db.collection('recruitingPlans').doc('2026').get();
if (rSnap.exists) {
  const r = rSnap.data();
  console.log('\n=== recruitingPlans/2026 ===');
  console.log('netMarginGoal:', r.netMarginGoal);
  console.log('companyRetentionPct:', r.companyRetentionPct);
}
process.exit(0);
