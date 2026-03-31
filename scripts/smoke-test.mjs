/**
 * smoke-test.mjs
 * Post-deploy smoke test for Smart Broker USA.
 *
 * Usage:
 *   node scripts/smoke-test.mjs [BASE_URL]
 *
 * If BASE_URL is omitted, defaults to the Firebase App Hosting live URL.
 * Exits with code 0 on success, 1 on failure.
 */

import https from 'https';
import http from 'http';

const BASE_URL = process.argv[2] || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';

const CHECKS = [
  {
    name: 'Build stamp API',
    path: '/api/build-stamp',
    expect: (body) => {
      const data = JSON.parse(body);
      if (!data.build) throw new Error(`Missing build field: ${body}`);
      console.log(`  ✓ Build: ${data.build}`);
    },
  },
  {
    name: 'Dashboard page (HTML)',
    path: '/dashboard',
    expect: (body) => {
      if (!body.includes('<!DOCTYPE html') && !body.includes('<html')) {
        throw new Error('Response does not look like HTML');
      }
      console.log(`  ✓ Dashboard HTML returned (${body.length} bytes)`);
    },
  },
  {
    name: 'Login page (HTML)',
    path: '/login',
    expect: (body) => {
      if (!body.includes('<!DOCTYPE html') && !body.includes('<html')) {
        throw new Error('Response does not look like HTML');
      }
      console.log(`  ✓ Login HTML returned (${body.length} bytes)`);
    },
  },
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'SmokeTester/1.0' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function run() {
  console.log(`\n🔍 Smoke test: ${BASE_URL}\n`);
  let passed = 0;
  let failed = 0;

  for (const check of CHECKS) {
    const url = `${BASE_URL}${check.path}`;
    process.stdout.write(`[${check.name}] ${url}\n`);
    try {
      const { status, body } = await fetch(url);
      if (status >= 500) throw new Error(`HTTP ${status}`);
      check.expect(body);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.error('❌ Smoke test FAILED');
    process.exit(1);
  } else {
    console.log('✅ Smoke test PASSED');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
