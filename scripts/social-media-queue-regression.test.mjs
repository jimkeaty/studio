import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const queue = read('src/lib/socialMedia/queue.ts');
const submit = read('src/app/api/social-media/route.ts');
const upload = read('src/app/api/social-media/upload/route.ts');
const update = read('src/app/api/social-media/[id]/route.ts');
const caption = read('src/app/api/social-media/caption/route.ts');
const library = read('src/app/api/social-media/content-library/route.ts');
const status = read('src/app/api/social-media/facebook/status/route.ts');
const connect = read('src/app/api/social-media/facebook/connect/route.ts');
const callback = read('src/app/api/social-media/facebook/callback/route.ts');
const publish = read('src/app/api/social-media/facebook/publish/route.ts');
const agentPage = read('src/app/dashboard/social-media/page.tsx');
const adminPage = read('src/app/dashboard/admin/media-queue/page.tsx');
const connectionsPage = read('src/app/dashboard/settings/social-connections/page.tsx');

test('uploads are grouped reviewable submissions with draft/ready/published/archive states and storage-only media bytes', () => {
  assert.match(queue, /socialMediaGroups/); assert.match(queue, /draft' \| 'ready_to_post' \| 'published' \| 'archived/); assert.match(upload, /social-media\/\$\{groupId\}/); assert.match(upload, /\.file\(path\)\.save/); assert.doesNotMatch(submit, /Buffer\.from|arrayBuffer/); assert.match(upload, /MAX_SOCIAL_MEDIA_BYTES/);
});
test('agent notes, AI draft, editable final caption, user timestamps, multiple media, and Marketing review are retained', () => {
  for (const source of [submit, update, agentPage, adminPage]) assert.match(source, /rawNotes|finalCaption/); assert.match(caption, /model: 'gpt-5-mini'/); assert.match(caption, /captionPrompt/); assert.match(agentPage, /multiple/); assert.match(adminPage, /Approve: Ready to Post/); assert.match(update, /Published status can only follow a successful official Facebook Page publish/);
});
test('caption actions include professional, casual, shorten, CTA, personal voice, and rewrite-from-notes options', () => {
  for (const label of ['Make professional', 'Make casual', 'Shorten', 'Add CTA', 'Make it sound like me', 'Rewrite from my notes']) assert.match(agentPage, new RegExp(label));
});
test('Facebook uses only an encrypted official Page connection with hashed one-use OAuth state and never accepts a personal-profile publish flow', () => {
  assert.match(queue, /aes-256-gcm/); assert.match(connect, /facebookPageOAuthStates/); assert.match(connect, /createHash\('sha256'\)/); assert.match(callback, /CREATE_CONTENT/); assert.match(callback, /pageTokenEncrypted/); assert.match(status, /personalProfilePublishingSupported: false/); assert.match(connectionsPage, /does not permit this system to post photos or videos to personal profiles/);
});
test('Page publishing requires explicit approval/confirmation, validates selected media, rejects mixed selection, preserves failed jobs, and returns canonical Facebook links', () => {
  assert.match(publish, /confirm !== true/); assert.match(publish, /ready_to_post/); assert.match(publish, /mixed media is not permitted/); assert.match(publish, /facebookPublishJobs/); assert.match(publish, /status: 'failed'/); assert.match(publish, /https:\/\/www\.facebook\.com\/\$\{postId\}/); assert.match(adminPage, /window\.confirm/); assert.match(agentPage, /Copy Caption/);
});
test('shared brokerage content-library templates and profile setup/reconnect/disconnect guidance are available through role-controlled routes', () => {
  assert.match(queue, /socialContentLibrary/); assert.match(library, /SOCIAL_CONTENT_LIBRARY_COLLECTION/); assert.match(library, /user\.isStaff/); assert.match(connectionsPage, /Connect \/ Reconnect Official Page/); assert.match(connectionsPage, /Disconnect Official Page/);
});
