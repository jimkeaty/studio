// Fix Anna Cain's firebaseUid in Firestore using Firebase Admin SDK
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

// Use application default credentials (available in Firebase App Hosting environment)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const ANNA_UID = 'MQQMpFsapRRY2UzYyCfnsv0e7JH3';
const ANNA_EMAIL = 'anna@keatyrealestate.com';

async function run() {
  console.log('Looking for Anna Cain staffUsers record...');
  
  // Try exact email match first
  let snap = await db.collection('staffUsers').where('email', '==', ANNA_EMAIL).get();
  
  // Try case-insensitive if not found
  if (snap.empty) {
    const all = await db.collection('staffUsers').get();
    const match = all.docs.find(d => (d.data().email || '').toLowerCase() === ANNA_EMAIL.toLowerCase());
    if (match) {
      snap = { empty: false, docs: [match] };
    }
  }

  if (snap.empty) {
    console.error('ERROR: No staffUsers record found for', ANNA_EMAIL);
    process.exit(1);
  }

  const doc = snap.docs[0];
  const data = doc.data();
  console.log('Found staffUsers doc:', doc.id);
  console.log('  email:', data.email);
  console.log('  role:', data.role);
  console.log('  status:', data.status);
  console.log('  current firebaseUid:', data.firebaseUid || '(none)');
  
  if (data.firebaseUid === ANNA_UID) {
    console.log('\nAlready set to the correct UID — no change needed.');
    console.log('Have Anna log out and back in to refresh her session.');
  } else {
    await doc.ref.update({ firebaseUid: ANNA_UID, updatedAt: new Date() });
    console.log('\nSUCCESS: Updated firebaseUid to', ANNA_UID);
    console.log('Anna should now log out and back in to get full office_admin access.');
  }

  process.exit(0);
}

run().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
