import fs from 'node:fs';
import admin from 'firebase-admin';

const EXPECTED_PROJECT_ID = 'smart-broker-usa';
const OUTPUT_PATH = '.manus-logs/legacy-transaction-type-audit.json';
const VALID_TYPES = new Set(['buyer', 'listing', 'dual', 'referral']);

function first(value) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function normalize(value) {
  return String(first(value) || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function canonical(value) {
  const normalized = normalize(value);
  const aliases = {
    buyer: 'buyer',
    buyer_side: 'buyer',
    buyer_representation: 'buyer',
    buyer_transaction: 'buyer',
    purchaser: 'buyer',
    listing: 'listing',
    seller: 'listing',
    seller_side: 'listing',
    seller_representation: 'listing',
    new_listing: 'listing',
    listing_transaction: 'listing',
    dual: 'dual',
    dual_agency: 'dual',
    both: 'dual',
    referral: 'referral',
    outbound_referral: 'referral',
    referral_out: 'referral',
  };
  return aliases[normalized] || '';
}

function present(value) {
  if (Array.isArray(value)) return value.length > 0 && value.some((item) => String(item || '').trim());
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function increment(map, key) {
  const normalized = key || '(blank)';
  map[normalized] = (map[normalized] || 0) + 1;
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (projectId !== EXPECTED_PROJECT_ID) {
  throw new Error(`Expected FIREBASE_PROJECT_ID=${EXPECTED_PROJECT_ID}; received ${projectId || '(missing)'}`);
}
if (!clientEmail || !privateKey) {
  throw new Error('Firebase Admin credentials are not available in this environment.');
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();
const snapshot = await db.collection('transactions').get();

const distributions = {
  closingType: {},
  side: {},
  transactionType: {},
  type: {},
  clientType: {},
};
const anomalies = [];
const summary = {
  totalTransactions: snapshot.size,
  currentlyResolvable: 0,
  missingCurrentType: 0,
  unsupportedCurrentType: 0,
  conflictingCurrentType: 0,
  ignoredExplicitCanonicalType: 0,
  likelyReferralMissingType: 0,
  unknownNoSafeInference: 0,
};

for (const doc of snapshot.docs) {
  const tx = doc.data();
  const raw = {
    closingType: first(tx.closingType),
    side: first(tx.side),
    transactionType: first(tx.transactionType),
    type: first(tx.type),
    clientType: first(tx.clientType),
  };
  Object.entries(raw).forEach(([key, value]) => increment(distributions[key], normalize(value)));

  // This precisely mirrors the existing unified-form behavior:
  // closingType || side || 'listing'. It intentionally does not use transactionType.
  const currentRaw = raw.closingType || raw.side || '';
  const currentType = canonical(currentRaw);
  const explicitType = canonical(raw.transactionType) || canonical(raw.type);
  const clientType = canonical(raw.clientType);
  const hasReferralSignals = Boolean(
    tx.isReferral === true ||
    normalize(tx.transactionType).includes('referral') ||
    normalize(tx.type).includes('referral') ||
    normalize(tx.referralType).includes('referral') ||
    normalize(tx.closingType).includes('referral') ||
    normalize(tx.side).includes('referral')
  );

  const flags = [];
  let recommendation = '';
  if (!currentRaw) {
    summary.missingCurrentType += 1;
    flags.push('missing_closingType_and_side');
  } else if (!currentType) {
    summary.unsupportedCurrentType += 1;
    flags.push(`unsupported_current_type:${normalize(currentRaw)}`);
  } else {
    summary.currentlyResolvable += 1;
  }

  const closingCanonical = canonical(raw.closingType);
  const sideCanonical = canonical(raw.side);
  if (closingCanonical && sideCanonical && closingCanonical !== sideCanonical) {
    summary.conflictingCurrentType += 1;
    flags.push(`conflict_closingType_${closingCanonical}_side_${sideCanonical}`);
  }

  if ((!currentType || flags.some((flag) => flag.startsWith('unsupported_current_type'))) && explicitType) {
    summary.ignoredExplicitCanonicalType += 1;
    flags.push(`ignored_explicit_type:${explicitType}`);
    recommendation = `Safely infer ${explicitType} from transactionType/type.`;
  }

  if ((!currentType || flags.some((flag) => flag.startsWith('unsupported_current_type'))) && hasReferralSignals) {
    summary.likelyReferralMissingType += 1;
    flags.push('likely_referral');
    recommendation = 'Safely infer referral from explicit referral marker.';
  }

  const hasAnyTypeSignal = Boolean(currentType || explicitType || clientType || hasReferralSignals);
  if ((!currentType || flags.some((flag) => flag.startsWith('unsupported_current_type'))) && !hasAnyTypeSignal) {
    summary.unknownNoSafeInference += 1;
    flags.push('no_safe_type_inference');
    recommendation = 'Needs human review; do not auto-classify.';
  }

  if (flags.length) {
    anomalies.push({
      id: doc.id,
      address: String(tx.address || tx.propertyAddress || tx.streetAddress || '').trim(),
      status: normalize(tx.status || tx.listingStatus),
      agent: String(tx.agentDisplayName || tx.agentName || '').trim(),
      raw,
      currentFormFallback: currentRaw ? (currentType || normalize(currentRaw)) : 'listing (implicit fallback)',
      inferredType: explicitType || (hasReferralSignals ? 'referral' : '') || clientType || '',
      referralSignals: hasReferralSignals,
      flags,
      recommendation,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'read-only',
  collection: 'transactions',
  summary,
  distributions,
  anomalies: anomalies.sort((a, b) => a.address.localeCompare(b.address) || a.id.localeCompare(b.id)),
};

fs.mkdirSync('.manus-logs', { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  output: OUTPUT_PATH,
  summary,
  anomalyCount: anomalies.length,
  sample: report.anomalies.slice(0, 20),
}, null, 2));
