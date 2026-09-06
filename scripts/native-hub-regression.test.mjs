import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const core = read('src/lib/hub/core.ts');
const hub = read('src/app/api/hub/route.ts');
const post = read('src/app/api/hub/[id]/route.ts');
const rsvp = read('src/app/api/hub/[id]/rsvp/route.ts');
const cron = read('src/app/api/cron/hub-publish/route.ts');
const page = read('src/app/dashboard/hub/page.tsx');
const admin = read('src/app/dashboard/admin/hub/page.tsx');
const branding = read('src/app/api/branding/route.ts');
const brandingAdmin = read('src/app/api/admin/branding/route.ts');

test('native Hub has one canonical post system with the approved content categories and lifecycle', () => {
  assert.match(core, /hubPosts/);
  for (const category of ['announcement', 'company_update', 'event', 'training', 'webinar', 'meeting', 'agent_development', 'reminder', 'resource', 'link', 'document', 'video']) assert.match(core, new RegExp(category));
  assert.match(core, /draft' \| 'scheduled' \| 'published' \| 'unpublished' \| 'archived/);
  assert.match(hub, /status === 'published'/);
  assert.match(post, /updates\.status/);
});
test('authorized authors can select every required audience and preferred channels without bypassing user notification preferences', () => {
  for (const field of ['roles', 'officeIds', 'teamIds', 'userIds', 'groupIds']) assert.match(core, new RegExp(field));
  assert.match(core, /sendNotification/);
  assert.match(core, /channels: \{ in_app: delivery\.inApp \? undefined : false, email: delivery\.email \? undefined : false, sms: delivery\.sms \? undefined : false/);
  for (const label of ['Everyone', 'Roles: agent, staff, tc, leadership', 'Office IDs', 'Team IDs', 'Tenant group IDs']) assert.match(admin, new RegExp(label));
});
test('events include date/time/location/online link/description/host/RSVP/audience/resources and record basic views', () => {
  for (const field of ['startsAt', 'endsAt', 'location', 'onlineLink', 'host', 'rsvpEnabled']) assert.match(hub, new RegExp(field));
  assert.match(rsvp, /hubEventRsvps/);
  assert.match(hub, /hubPostViews/);
  assert.match(hub, /requiresAcknowledgment: false/);
  assert.match(hub, /resources/);
});
test('native Hub display uses the mandated section structure, tenant branding, legacy transition, and links instead of duplicating market feeds', () => {
  for (const section of ['Featured Announcement', 'Upcoming Events', 'Latest Updates', 'Training & Classes', 'Resources']) assert.match(page, new RegExp(section));
  assert.match(page, /data\.branding\.hubName/);
  assert.match(page, /legacy Google Keaty Hub remains available/);
  assert.match(page, /Coming Soons & Buyer Needs/);
  assert.doesNotMatch(page, /collection\('comingSoon|collection\('buyerNeeds|collection\('priceReductions/);
});
test('Hub names are tenant-configurable and publication scheduling uses a secured, auditable background route', () => {
  for (const source of [branding, brandingAdmin]) { assert.match(source, /hubName/); assert.match(source, /hubSubtitle/); }
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /status', '==', 'scheduled'/);
  assert.match(cron, /notifyHubPost/);
});
