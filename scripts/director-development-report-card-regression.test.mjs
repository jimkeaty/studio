import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const reportRoutePath = new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url);
const reportCardPath = new URL('../src/components/dashboard/broker/DirectorDevelopmentReportCard.tsx', import.meta.url);
const recruitingPagePath = new URL('../src/app/dashboard/admin/recruiting/page.tsx', import.meta.url);
const oneOnOneRoutePath = new URL('../src/app/api/agent/one-on-ones/route.ts', import.meta.url);
const todoBoardPath = new URL('../src/components/dashboard/broker/RecruiterTodoBoard.tsx', import.meta.url);

test('Director report card remains assigned to a named Director and supports configurable goals', async () => {
  const [route, card] = await Promise.all([readFile(reportRoutePath, 'utf8'), readFile(reportCardPath, 'utf8')]);

  assert.match(route, /directorName: 'Ethan'/);
  assert.match(route, /directorName: String\(body\.directorName/);
  assert.match(route, /action === 'savePlan'/);
  assert.match(route, /customKpis: normalizeCustomKpis/);
  assert.match(card, /Named Director of Agent Development/);
  assert.match(card, /Director of Agent Development/);
  assert.match(card, /Custom KPIs/);
});

test('Director scorecard protects the required weekly, monthly, and quarterly coaching cadence', async () => {
  const route = await readFile(reportRoutePath, 'utf8');

  assert.match(route, /New Agent 1:1s — This Week/);
  assert.match(route, /Agents Under 1 Year — This Month/);
  assert.match(route, /No Production or Pending in Last 60 Days — This Month/);
  assert.match(route, /All-Agent Strategy 1:1s — This Quarter/);
  assert.match(route, /calculateOperationalMeetingEligibility/);
  assert.match(route, /sixtyDayWindowStart/);
  assert.match(route, /new Set\(\['weekly_90day', 'weekly'\]\)/);
  assert.match(route, /new Set\(\['quarterly_strategy'\]\)/);
  assert.match(route, /requireNotes = false/);
});

test('Director scorecard requires four documented in-person relationship meetings each week', async () => {
  const [route, card] = await Promise.all([readFile(reportRoutePath, 'utf8'), readFile(reportCardPath, 'utf8')]);

  assert.match(route, /'in_person_relationship_meeting'/);
  assert.match(route, /relationshipMeetingsThisWeek\.length, 4, 'meetings'/);
  assert.match(route, /organization:/);
  assert.match(route, /relationshipPurpose:/);
  assert.match(route, /Choose retention or recruiting as the meeting purpose/);
  assert.match(card, /In-Person Coffee \/ Lunch Relationship Meeting/);
  assert.match(card, /Retention — Current Keaty Agent/);
  assert.match(card, /Recruiting — External Agent \/ Prospect/);
});

test('Director report card follows the established Production report cards in the Admin Report Cards view and preserves meeting notes', async () => {
  const [page, oneOnOneRoute, todoBoard] = await Promise.all([
    readFile(recruitingPagePath, 'utf8'),
    readFile(oneOnOneRoutePath, 'utf8'),
    readFile(todoBoardPath, 'utf8'),
  ]);

  assert.match(page, /TabsTrigger value="admin-report-cards">Admin Report Cards/);
  assert.match(page, /<DirectorDevelopmentReportCard year=\{year\} \/>/);
  assert.ok(page.indexOf('<UnifiedRecruitingReportCard year={year} />') < page.indexOf('<DirectorDevelopmentReportCard year={year} />'));
  assert.match(oneOnOneRoute, /'status', 'notes', 'completedAt', 'completionNotes'/);
  assert.match(oneOnOneRoute, /updates\.status === 'completed'/);
  assert.match(todoBoard, /Quarterly — Strategy & Plan/);
  assert.match(todoBoard, /Quarterly strategy 1:1s require a documented strategic plan/);
});
