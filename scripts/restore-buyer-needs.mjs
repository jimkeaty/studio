/**
 * restore-buyer-needs.mjs
 * Finds all buyerNeeds with status='removed' that were removed within the last 3 days
 * and restores them to status='active', clearing removedAt and removedReason.
 *
 * Run: GOOGLE_APPLICATION_CREDENTIALS=... node scripts/restore-buyer-needs.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load service account from env or local file
let serviceAccount;
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (credPath) {
  serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
} else {
  // Try to find it in the project root
  const candidates = [
    resolve(__dirname, '../service-account.json'),
    resolve(__dirname, '../serviceAccount.json'),
    resolve(__dirname, '../firebase-service-account.json'),
  ];
  for (const c of candidates) {
    try { serviceAccount = JSON.parse(readFileSync(c, 'utf8')); break; } catch {}
  }
}

if (!serviceAccount) {
  console.error('❌ No service account found. Set GOOGLE_APPLICATION_CREDENTIALS or place service-account.json in project root.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

async function main() {
  console.log('🔍 Querying buyerNeeds with status=removed...');
  const snap = await db.collection('buyerNeeds')
    .where('status', '==', 'removed')
    .get();

  if (snap.empty) {
    console.log('ℹ️  No removed buyer needs found in Firestore.');
    return;
  }

  console.log(`Found ${snap.size} removed buyer needs total.`);

  // Filter to those removed recently (within 3 days) OR those with removedReason='auto_stale'
  const toRestore = snap.docs.filter(doc => {
    const data = doc.data();
    const removedAt = data.removedAt?.toDate?.();
    const isRecentlyRemoved = removedAt && removedAt >= THREE_DAYS_AGO;
    const isAutoStale = data.removedReason === 'auto_stale';
    return isRecentlyRemoved || isAutoStale;
  });

  if (toRestore.length === 0) {
    console.log('ℹ️  No recently removed buyer needs to restore (all were removed more than 3 days ago).');
    console.log('   If you want to restore older records, adjust THREE_DAYS_AGO in this script.');
    return;
  }

  console.log(`\n📋 Buyer needs to restore (${toRestore.length}):`);
  for (const doc of toRestore) {
    const d = doc.data();
    const removedAt = d.removedAt?.toDate?.()?.toISOString() ?? 'unknown';
    console.log(`  • [${doc.id}] ${d.area || d.address || 'No description'} — agent: ${d.agentName || 'unknown'} — removedAt: ${removedAt}`);
  }

  console.log('\n🔄 Restoring...');
  let restored = 0;
  for (const doc of toRestore) {
    await doc.ref.update({
      status: 'active',
      removedAt: FieldValue.delete(),
      removedReason: FieldValue.delete(),
      // Reset lastConfirmedAt to now so the 14-day clock restarts fresh
      lastConfirmedAt: FieldValue.serverTimestamp(),
      restoredAt: FieldValue.serverTimestamp(),
      restoredReason: 'manual_admin_restore',
    });
    restored++;
    console.log(`  ✅ Restored: ${doc.id}`);
  }

  console.log(`\n✅ Done. Restored ${restored} buyer needs.`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
