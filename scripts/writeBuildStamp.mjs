import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const full =
  process.env.COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.SOURCE_VERSION ||
  process.env.REVISION_ID ||
  "";

const short = full ? full.slice(0, 7) : "unknown";

const branch =
  process.env.GIT_BRANCH ||
  process.env.BRANCH_NAME ||
  process.env.GITHUB_REF_NAME ||
  "fix/hydration-mismatch";

const stamp = `${short}-${branch}`;

const outPath = path.join(root, "src/lib/buildStamp.ts");

const contents = `// AUTO-GENERATED FILE
export const BUILD_STAMP = "${stamp}";
export const BUILD_STAMP_FULL = "${full || "unknown"}";
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, contents);

console.log("BUILD STAMP:", stamp);
