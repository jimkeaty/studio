/**
 * fix-admin-email.mjs
 *
 * One-time script to replace all hardcoded 'jim@keatyrealestate.com' email
 * checks with isAdminLike() across all admin API routes.
 *
 * Run: node scripts/fix-admin-email.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(process.cwd(), 'src');

// Files to fix (relative to project root)
const FILES = [
  'src/app/api/admin/agent-profiles/[agentId]/route.ts',
  'src/app/api/admin/agent-profiles/duplicates/route.ts',
  'src/app/api/admin/agent-profiles/merge/route.ts',
  'src/app/api/admin/agent-profiles/route.ts',
  'src/app/api/admin/agents/route.ts',
  'src/app/api/admin/bulk-delete/route.ts',
  'src/app/api/admin/debug-transactions/route.ts',
  'src/app/api/admin/fix-imports/route.ts',
  'src/app/api/admin/import-activities/route.ts',
  'src/app/api/admin/import/route.ts',
  'src/app/api/admin/member-plans/[memberPlanId]/route.ts',
  'src/app/api/admin/member-plans/route.ts',
  'src/app/api/admin/tc/[id]/route.ts',
  'src/app/api/admin/team-memberships/[membershipId]/route.ts',
  'src/app/api/admin/team-memberships/route.ts',
  'src/app/api/admin/team-plans/[teamPlanId]/route.ts',
  'src/app/api/admin/team-plans/route.ts',
  'src/app/api/admin/teams/[teamId]/route.ts',
  'src/app/api/admin/teams/route.ts',
];

let totalFixed = 0;

for (const rel of FILES) {
  const full = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(full)) {
    console.warn(`  SKIP (not found): ${rel}`);
    continue;
  }

  let text = fs.readFileSync(full, 'utf8');
  const original = text;

  // ── 1. Add isAdminLike import if not already present ─────────────────────
  const hasIsAdminLike = text.includes("isAdminLike");
  const hasStaffAccessImport = text.includes("staffAccess");

  if (!hasIsAdminLike) {
    // Insert after the last import line
    const importMatch = text.match(/^(import .+\n)+/m);
    if (importMatch) {
      // Find the position after all imports
      const lastImportEnd = text.lastIndexOf('\nimport ');
      const afterLastImport = text.indexOf('\n', lastImportEnd + 1) + 1;
      text =
        text.slice(0, afterLastImport) +
        "import { isAdminLike } from '@/lib/auth/staffAccess';\n" +
        text.slice(afterLastImport);
    }
  }

  // ── 2. Remove ADMIN_EMAIL constant ────────────────────────────────────────
  text = text.replace(
    /const ADMIN_EMAIL\s*=\s*['"]jim@keatyrealestate\.com['"];\s*\n/g,
    ''
  );

  // ── 3. Replace email-based checks ─────────────────────────────────────────
  // Pattern A: if (email !== 'jim@keatyrealestate.com') { return ... }
  text = text.replace(
    /if\s*\(\s*email\s*!==\s*['"]jim@keatyrealestate\.com['"]\s*\)\s*\{[^}]*\}/g,
    (match) => {
      // Extract the return statement inside the braces
      const inner = match.match(/\{([^}]*)\}/)?.[1]?.trim() || "return jsonError(403, 'Forbidden: Admin only');";
      return `if (!(await isAdminLike(decoded.uid))) {\n    ${inner}\n  }`;
    }
  );

  // Pattern B: if (decoded.email !== 'jim@keatyrealestate.com') { return ... }
  text = text.replace(
    /if\s*\(\s*decoded\.email\s*!==\s*['"]jim@keatyrealestate\.com['"]\s*\)\s*\{[^}]*\}/g,
    (match) => {
      const inner = match.match(/\{([^}]*)\}/)?.[1]?.trim() || "return jsonError(403, 'Forbidden: Admin only');";
      return `if (!(await isAdminLike(decoded.uid))) {\n    ${inner}\n  }`;
    }
  );

  // Pattern C: if (email !== ADMIN_EMAIL) { return ... }
  text = text.replace(
    /if\s*\(\s*email\s*!==\s*ADMIN_EMAIL\s*\)\s*\{[^}]*\}/g,
    (match) => {
      const inner = match.match(/\{([^}]*)\}/)?.[1]?.trim() || "return jsonError(403, 'Forbidden: Admin only');";
      return `if (!(await isAdminLike(decoded.uid))) {\n    ${inner}\n  }`;
    }
  );

  // ── 4. Remove unused `email` variable if it's now only used in the check ──
  // Only remove if `email` is only referenced in the old check (now gone)
  // We'll check: if `email` appears only in `const email = decoded.email || ''`
  // and nowhere else, remove that line too.
  const emailUsages = (text.match(/\bemail\b/g) || []).length;
  if (emailUsages === 1 && text.includes("const email = decoded.email")) {
    text = text.replace(/\s*const email\s*=\s*decoded\.email[^;]*;\s*\n/g, '\n');
  }

  if (text !== original) {
    fs.writeFileSync(full, text, 'utf8');
    console.log(`  FIXED: ${rel}`);
    totalFixed++;
  } else {
    console.log(`  UNCHANGED: ${rel}`);
  }
}

console.log(`\nDone. Fixed ${totalFixed} files.`);
