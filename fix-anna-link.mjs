import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const admin = require('firebase-admin');
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'service-account.json'), 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const auth = admin.auth();

async function run() {
  const email = 'anna@keatyrealestate.com';

  // Step 1: Look up Firebase Auth by email
  let fbUser;
  try {
    fbUser = await auth.getUserByEmail(email);
    console.log('Firebase Auth found:');
    console.log('  UID:', fbUser.uid);
    console.log('  Email:', fbUser.email);
    console.log('  Display Name:', fbUser.displayName);
  } catch (e) {
    console.error('No Firebase Auth account found for', email, ':', e.message);
    process.exit(1);
  }

  // Step 2: Find staffUsers record (exact match first)
  let docRef = null;
  let docData = null;
  let docId = null;

  const exactSnap = await db.collection('staffUsers').where('email', '==', email).get();
  if (!exactSnap.empty) {
    docRef = exactSnap.docs[0].ref;
    docData = exactSnap.docs[0].data();
    docId = exactSnap.docs[0].id;
    console.log('\nstaffUsers record found (exact match):');
  } else {
    const allSnap = await db.collection('staffUsers').get();
    const match = allSnap.docs.find(d => (d.data().email || '').toLowerCase() === email.toLowerCase());
    if (match) {
      docRef = match.ref;
      docData = match.data();
      docId = match.id;
      console.log('\nstaffUsers record found (case-insensitive match):');
    }
  }

  if (!docRef || !docData) {
    console.error('No staffUsers record found for', email);
    process.exit(1);
  }

  console.log('  Doc ID:', docId);
  console.log('  Stored email:', docData.email);
  console.log('  Stored firebaseUid:', docData.firebaseUid || '(none)');
  console.log('  Role:', docData.role);
  console.log('  Status:', docData.status);

  // Step 3: Fix if needed
  if (docData.firebaseUid === fbUser.uid) {
    console.log('\nAlready correctly linked — firebaseUid matches Firebase Auth UID.');
    console.log('The issue is elsewhere. Anna should log out and back in to refresh her token.');
  } else {
    await docRef.update({ firebaseUid: fbUser.uid, updatedAt: new Date() });
    console.log('\nFIXED: wrote firebaseUid', fbUser.uid, 'to staffUsers/', docId);
    console.log('Anna should now log out and back in to get full admin access.');
  }

  process.exit(0);
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
