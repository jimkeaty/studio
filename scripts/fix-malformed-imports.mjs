/**
 * fix-malformed-imports.mjs
 *
 * Fixes the 5 files where the isAdminLike import was incorrectly injected
 * inside a multi-line `import type {` block.
 *
 * Pattern to fix:
 *   import type {
 *   import { isAdminLike } from '@/lib/auth/staffAccess';
 *     SomeType,
 *   } from '...';
 *
 * Should become:
 *   import { isAdminLike } from '@/lib/auth/staffAccess';
 *   import type {
 *     SomeType,
 *   } from '...';
 */
import fs from 'node:fs';
import path from 'node:path';

const FILES = [
  'src/app/api/admin/member-plans/route.ts',
  'src/app/api/admin/member-plans/[memberPlanId]/route.ts',
  'src/app/api/admin/team-memberships/route.ts',
  'src/app/api/admin/team-plans/route.ts',
  'src/app/api/admin/team-plans/[teamPlanId]/route.ts',
];

const IMPORT_LINE = "import { isAdminLike } from '@/lib/auth/staffAccess';";

for (const rel of FILES) {
  const full = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(full)) {
    console.warn(`SKIP (not found): ${rel}`);
    continue;
  }

  let text = fs.readFileSync(full, 'utf8');

  // Check if the import is misplaced inside an import type block
  // Pattern: "import type {\nimport { isAdminLike }..."
  if (!text.includes(`import type {\n${IMPORT_LINE}`)) {
    console.log(`OK (no fix needed): ${rel}`);
    continue;
  }

  // Remove the misplaced import line from inside the type block
  text = text.replace(`import type {\n${IMPORT_LINE}\n`, 'import type {\n');

  // Now add the import after the last regular import line
  // Find the end of all imports (before first non-import line)
  const lines = text.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ') || line === '}' || line.startsWith('} from ')) {
      // Check if we're in an import block
      if (lines[i].startsWith('import ') || (lastImportIdx >= 0 && !line.startsWith('function') && !line.startsWith('const') && !line.startsWith('export') && !line.startsWith('//'))) {
        lastImportIdx = i;
      }
    }
  }

  // Find the last import statement end (including multi-line imports)
  let inImport = false;
  let lastImportEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('import ')) {
      inImport = true;
    }
    if (inImport) {
      lastImportEnd = i;
      if (line.includes(';') && !line.includes('{')) {
        inImport = false;
      } else if (line.trim() === '}' || line.includes("} from '") || line.includes('} from "')) {
        inImport = false;
      }
    }
  }

  // Insert after last import
  if (lastImportEnd >= 0) {
    lines.splice(lastImportEnd + 1, 0, IMPORT_LINE);
    text = lines.join('\n');
    fs.writeFileSync(full, text, 'utf8');
    console.log(`FIXED: ${rel}`);
  } else {
    console.warn(`Could not find insertion point: ${rel}`);
  }
}

console.log('\nDone.');
