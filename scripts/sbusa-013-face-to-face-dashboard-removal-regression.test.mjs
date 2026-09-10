import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('src/app/dashboard/admin/recruiting/page.tsx');
const route = read('src/app/api/broker/face-to-face-meetings/route.ts');
const panel = read('src/components/dashboard/broker/FaceToFaceRecruitingMeetings.tsx');
const directorRoute = read('src/app/api/broker/dad-report-card/route.ts');

test('SBUSA-013 removes dedicated face-to-face dashboard tabs, cards, counts, and dashboard-only component links', () => {
  assert.doesNotMatch(page, /face-to-face/);
  assert.doesNotMatch(page, /FaceToFaceRecruitingMeetings/);
  assert.match(page, /md:grid-cols-4/);
});

test('SBUSA-013 preserves the face-to-face route, historical component, recruiting-plan history, and linked pipeline records', () => {
  assert.match(route, /collection\('recruitingPlans'\)/);
  assert.match(route, /faceToFaceRecruitingGoals/);
  assert.match(route, /collection\('directorDevelopmentActivities'\)/);
  assert.match(route, /sourceFaceToFaceMeetingId/);
  assert.match(panel, /Meeting History/);
  assert.match(panel, /preserved meeting records/);
});

test('New Agent One-on-Ones remain an Agent Development metric after dashboard removal', () => {
  assert.match(directorRoute, /weekly_new_agent_one_on_ones: \{ section: 'agent_development'/);
  assert.match(directorRoute, /New Agent 1:1s — This Week/);
  assert.match(directorRoute, /calculateOperationalMeetingEligibility/);
});
