import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../src/app/api/broker/face-to-face-meetings/route.ts', import.meta.url);
const panelPath = new URL('../src/components/dashboard/broker/FaceToFaceRecruitingMeetings.tsx', import.meta.url);
const pagePath = new URL('../src/app/dashboard/admin/recruiting/page.tsx', import.meta.url);

test('face-to-face recruiting meetings reuse canonical recruiting plans and activity records', async () => {
  const route = await readFile(routePath, 'utf8');
  assert.match(route, /collection\('recruitingPlans'\)\.doc\(String\(year\)\)/);
  assert.match(route, /faceToFaceRecruitingGoals/);
  assert.match(route, /collection\('directorDevelopmentActivities'\)/);
  assert.match(route, /activityType: 'in_person_relationship_meeting'/);
  assert.match(route, /const history = \[\.\.\.prior\.history, snapshot\]/);
  assert.match(route, /defaultWeeklyGoal.*4/);
});

test('face-to-face meeting records keep required fields separate from interviews and preserve recruit stages', async () => {
  const [route, panel] = await Promise.all([readFile(routePath, 'utf8'), readFile(panelPath, 'utf8')]);
  assert.match(route, /agentOrRecruit/);
  assert.match(route, /recruiterName/);
  assert.match(route, /meetingType/);
  assert.match(route, /organization/);
  assert.match(route, /recruitingStatus/);
  assert.match(route, /outcome/);
  assert.match(route, /nextFollowUpDate/);
  assert.match(route, /nextFollowUpAction/);
  assert.match(route, /const OUTCOMES = new Set\(\['Interested', 'Follow-up Needed', 'Not Ready', 'Not Interested', 'Appointment Scheduled'\]\)/);
  assert.match(panel, /separate from formal interviews and never change a recruit stage/);
  assert.doesNotMatch(route, /status:\s*['"](?:interview|scheduled_start|started)['"]/);
});

test('linked candidate follow-ups extend the existing recruiting pipeline history rather than a duplicate task system', async () => {
  const route = await readFile(routePath, 'utf8');
  assert.match(route, /collection\('recruitingPipelineActivity'\)/);
  assert.match(route, /sourceFaceToFaceMeetingId/);
  assert.match(route, /followUpDate: nextFollowUpDate/);
  assert.match(route, /followUpAction: nextFollowUpAction/);
  assert.match(route, /collection\('recruitingPipeline'\)\.doc\(pipelineCandidateId\)/);
});

test('Recruiting and Development exposes a distinct Face-to-Face Meetings view', async () => {
  const page = await readFile(pagePath, 'utf8');
  assert.match(page, /TabsTrigger value="face-to-face">Face-to-Face Meetings/);
  assert.match(page, /<FaceToFaceRecruitingMeetings year=\{year\} \/>/);
});
