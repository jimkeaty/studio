import fs from "node:fs";
import path from "node:path";

const outPath = path.resolve(process.cwd(), "src/lib/firebaseWebAppConfig.ts");
const raw = process.env.FIREBASE_WEBAPP_CONFIG;

if (!raw) {
  // Still write a stub so builds don’t crash in environments without it
  // (local dev can use NEXT_PUBLIC_* fallback in src/lib/firebase.ts)
  fs.writeFileSync(
    outPath,
    `// Generated at build time\nexport const FIREBASE_WEBAPP_CONFIG_JSON = "";\n`
  );
  console.log("FIREBASE_WEBAPP_CONFIG missing at build time; wrote empty firebaseWebAppConfig.ts");
  process.exit(0);
}

fs.writeFileSync(
  outPath,
  `// Generated at build time (Firebase App Hosting)\nexport const FIREBASE_WEBAPP_CONFIG_JSON = ${JSON.stringify(raw)};\n`
);

console.log("Firebase Web App config written: src/lib/firebaseWebAppConfig.ts");
