import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();

function safe(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

// Prefer git (works in Cloud Build + local), fallback to env
const full =
  safe("git rev-parse HEAD") ||
  process.env.COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.SOURCE_VERSION ||
  process.env.REVISION_ID ||
  "";

const short = full ? full.slice(0, 7) : "unknown";

const branch =
  safe("git rev-parse --abbrev-ref HEAD") ||
  process.env.GIT_BRANCH ||
  process.env.BRANCH_NAME ||
  process.env.GITHUB_REF_NAME ||
  "fix/hydration-mismatch";

const stamp = `${short}-${branch}`;

const outPath = path.join(root, "src/lib/buildStamp.ts");
const contents = `// AUTO-GENERATED at build time. Do not edit by hand.
export const BUILD_STAMP = ${JSON.stringify(stamp)};
export const BUILD_STAMP_FULL = ${JSON.stringify(full || "unknown")};
export const BUILD_BRANCH = ${JSON.stringify(branch)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, contents, "utf8");

console.log("BUILD_STAMP written:", stamp);
