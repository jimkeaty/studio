'use strict';

/**
 * Smart Broker USA — Apply Historical Correction
 * - This is an ADMIN-ONLY script.
 * - Creates/updates an override for a locked historical rollup (year < 2025).
 * - Creates an immutable audit record for the change.
 *
 * USAGE:
 * node imports/apply-correction.js \
 *   --targetKey="ashley-lombas_2023" \
 *   --year=2023 \
 *   --agentId="ashley-lombas" \
 *   --reason="Auditor found discrepancy in Q4 closed units." \
 *   --adminUid="YOUR_ADMIN_UID" \
 *   --overrideFields='{"closed": 15, "totals": {"transactions": 18, "all": 22}}' \
 *   --confirm
 */

const admin = require('firebase-admin');

// --- CONFIGURATION ---
const ADMIN_UIDS = ["ADMIN_USER_UID_1", "ADMIN_USER_UID_2"]; // Replace with actual admin UIDs
const ALLOWED_OVERRIDE_FIELDS = new Set([
  'closed', 'pending', 'listings', 'totals'
]);

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
  return admin.firestore();
}

function parseArgs() {
    const args = process.argv.slice(2).reduce((acc, arg) => {
        const [key, value] = arg.split('=');
        acc[key.replace(/^--/, '')] = value;
        return acc;
    }, {});
    
    if (process.argv.includes('--confirm')) {
        args.confirm = true;
    }

    const required = ['targetKey', 'year', 'agentId', 'reason', 'adminUid', 'overrideFields'];
    for (const r of required) {
        if (!args[r]) {
            console.error(`❌ Missing required argument: --${r}`);
            process.exit(1);
        }
    }
    return {
        targetKey: args.targetKey,
        year: Number(args.year),
        agentId: args.agentId,
        reason: args.reason,
        adminUid: args.adminUid,
        overrideFields: JSON.parse(args.overrideFields),
        confirm: args.confirm === true,
    };
}

function validateInputs(args) {
  if (!ADMIN_UIDS.includes(args.adminUid)) {
    throw new Error('Provided adminUid is not in the allowlist.');
  }
  if (args.year >= 2025) {
    throw new Error('This tool is only for historical corrections (year < 2025).');
  }
  if (`${args.agentId}_${args.year}` !== args.targetKey) {
    throw new Error('targetKey must match the format {agentId}_{year}.');
  }
  if (typeof args.overrideFields !== 'object' || args.overrideFields === null) {
    throw new Error('overrideFields must be a valid JSON object string.');
  }
  for (const key in args.overrideFields) {
    if (!ALLOWED_OVERRIDE_FIELDS.has(key)) {
      throw new Error(`Invalid override field: "${key}". Only specific fields can be overridden.`);
    }
  }
  if (!args.reason.trim()) {
    throw new Error('A non-empty reason is required.');
  }
}

async function main() {
  const args = parseArgs();
  console.log('--- Historical Correction Script ---');
  console.log('Parsed Arguments:', { ...args, overrideFields: JSON.stringify(args.overrideFields) });

  try {
    validateInputs(args);
  } catch (e) {
    console.error(`❌ Validation failed: ${e.message}`);
    process.exit(1);
  }

  if (!args.confirm) {
    console.log('\nDRY RUN. No changes will be written.');
    console.log('Re-run with --confirm flag to apply changes.');
    return;
  }

  const db = getDb();
  const FieldValue = admin.firestore.FieldValue;

  const overrideRef = db.collection('historical_overrides').doc(args.targetKey);
  const correctionRef = db.collection('historical_corrections').doc(); // Auto-ID

  try {
    await db.runTransaction(async (tx) => {
      const overrideSnap = await tx.get(overrideRef);
      const existingOverride = overrideSnap.exists ? overrideSnap.data() : null;

      const beforeState = existingOverride ? (existingOverride.overrideFields || null) : null;
      const changeType = existingOverride ? 'update_override' : 'create_override';

      // 1. Set/update the active override document
      const newOverrideData = {
        targetType: 'rollup',
        targetKey: args.targetKey,
        year: args.year,
        agentId: args.agentId,
        overrideFields: args.overrideFields,
        reason: args.reason,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: args.adminUid,
        active: true,
      };

      if (changeType === 'create_override') {
        newOverrideData.createdAt = FieldValue.serverTimestamp();
        newOverrideData.createdByUid = args.adminUid;
        tx.set(overrideRef, newOverrideData);
      } else {
        tx.update(overrideRef, newOverrideData);
      }

      // 2. Create the immutable audit log document
      const correctionData = {
        targetType: 'rollup',
        targetKey: args.targetKey,
        year: args.year,
        agentId: args.agentId,
        changeType: changeType,
        before: beforeState,
        after: args.overrideFields,
        reason: args.reason,
        createdAt: FieldValue.serverTimestamp(),
        createdByUid: args.adminUid,
      };
      tx.set(correctionRef, correctionData);
    });

    console.log('\n✅ Transaction successful!');
    console.log(`- Wrote/Updated override: historical_overrides/${args.targetKey}`);
    console.log(`- Created audit record: historical_corrections/${correctionRef.id}`);

  } catch (e) {
    console.error('\n❌ Transaction failed:', e);
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});