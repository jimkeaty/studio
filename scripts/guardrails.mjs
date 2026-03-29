import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve(process.cwd(), "src");

// Hard ban anywhere in src/
const BANNED_IMPORTS_ANYWHERE = [
  "firebase/firestore",
  "from 'firebase/firestore'",
  'from "firebase/firestore"',
];

// Only ban these *outside* server-safe zones
const BANNED_PATTERNS_CLIENT_ONLY = [
  "getFirestore(",
  "onSnapshot(",
  "getDoc(",
  "getDocs(",
  "collection(",
  "query(",
];

function isServerSafe(rel) {
  // Normalize to forward slashes for cross-platform compatibility
  const r = rel.replace(/\\/g, "/");

  // API routes are server-safe
  if (r.startsWith("src/app/api/")) return true;

  // Explicit server-only libs allowed to use admin SDK patterns
  if (r.startsWith("src/lib/firebaseAdmin")) return true;
  if (r.startsWith("src/lib/firebase/admin")) return true;
  if (r.startsWith("src/lib/overrides")) return true;

  return false;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC_ROOT);
const violations = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const text = fs.readFileSync(file, "utf8");

  // 1) Firestore client SDK imports are banned everywhere
  for (const bad of BANNED_IMPORTS_ANYWHERE) {
    if (text.includes(bad)) {
      violations.push({ file: rel, reason: `banned import: ${bad}` });
      break;
    }
  }

  // 2) Client-only patterns banned outside server-safe zones
  if (!isServerSafe(rel)) {
    for (const pat of BANNED_PATTERNS_CLIENT_ONLY) {
      if (text.includes(pat)) {
        violations.push({ file: rel, reason: `banned client pattern outside API/server libs: ${pat}` });
        break;
      }
    }
  }
}

if (violations.length) {
  console.error("\n🚨 GUARDRAILS FAILED\n");
  for (const v of violations) {
    console.error(`- ${v.file}\n  ${v.reason}\n`);
  }
  console.error("Fix: Client must not import Firestore. Only API routes use Admin SDK.\n");
  process.exit(1);
}

console.log("✅ Guardrails passed: no client Firestore anywhere in src/");
