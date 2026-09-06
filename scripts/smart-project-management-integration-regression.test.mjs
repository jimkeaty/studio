import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const registry = readFileSync(new URL('src/lib/plugins/registry.ts', root), 'utf8');
const plugins = readFileSync(new URL('src/hooks/useAgentPlugins.ts', root), 'utf8');
const sidebar = readFileSync(new URL('src/components/dashboard/sidebar-nav.tsx', root), 'utf8');

test('Smart Project Management is launched as a tenant-configured external suite app rather than rebuilt or embedded', () => {
  assert.match(registry, /id: 'smart-project-management'/);
  assert.match(registry, /externalUrl: 'https:\/\/jimcommands-k9phwrqh\.manus\.space'/);
  assert.match(registry, /defaultEnabled: false/);
  assert.doesNotMatch(registry, /smart-project-management[\s\S]{0,350}iframe/);
});

test('suite-app access remains configurable through canonical agent and company plugin entitlement lists', () => {
  assert.match(plugins, /enabledPlugins/);
  assert.match(plugins, /companyPlugins/);
  assert.match(sidebar, /FolderKanban/);
});
