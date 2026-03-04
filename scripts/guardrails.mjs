import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src/app");
const FORBIDDEN = [
  "firebase/firestore",
  "from 'firebase/firestore'",
  'from "firebase/firestore"',
  "getFirestore(",
  "collection(",
  "query(",
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx") || full.endsWith(".js") || full.endsWith(".jsx"))) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

let violations = [];

for (const f of files) {
  const text = fs.readFileSync(f, "utf8");

  // Hard rule: absolutely no firebase/firestore imports in src/app
  if (text.includes("firebase/firestore")) {
    violations.push({ file: f, reason: "imports firebase/firestore (client Firestore not allowed in src/app)" });
    continue;
  }

  // Optional: catch obvious Firestore client usage patterns
  // (keeps false positives minimal)
  // If you ever get a false positive, we can refine.
}

if (violations.length) {
  console.error("\n🚨 GUARDRAIL FAILED: Client Firestore detected in src/app\n");
  for (const v of violations) {
    console.error(`- ${v.file}\n  ${v.reason}\n`);
  }
  console.error("Fix: Move Firestore reads into API routes (Admin SDK) and fetch from client.\n");
  process.exit(1);
}

console.log("✅ Guardrails passed: no client Firestore in src/app");
