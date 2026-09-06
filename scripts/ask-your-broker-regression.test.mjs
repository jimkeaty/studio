import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const assistantRoute = read('src/app/api/ask-your-broker/route.ts');
const reviewRoute = read('src/app/api/admin/ask-your-broker/[id]/route.ts');
const knowledgeRoute = read('src/app/api/admin/ask-your-broker/knowledge/route.ts');
const agentPage = read('src/app/dashboard/ask-your-broker/page.tsx');
const adminPage = read('src/app/dashboard/admin/ask-your-broker/page.tsx');
const brandingRoute = read('src/app/api/admin/branding/route.ts');

test('assistant answers are grounded only in explicitly approved knowledge, with jurisdiction, form version, source URL, and update metadata supported', () => {
  assert.match(assistantRoute, /collection\('brokerKnowledge'\)\.where\('status', '==', 'approved'\)/);
  assert.match(assistantRoute, /Answer only from the approved source material/);
  assert.match(knowledgeRoute, /jurisdiction/);
  assert.match(knowledgeRoute, /formVersion/);
  assert.match(knowledgeRoute, /documentUrl/);
  assert.match(knowledgeRoute, /sourceUpdatedAt/);
});

test('legal, contractual, termination, breach, and judgment-risk questions are escalated without invented AI advice', () => {
  const helper = read('src/lib/askYourBroker.ts');
  assert.match(helper, /termination/);
  assert.match(helper, /breach/);
  assert.match(helper, /legal/);
  assert.match(assistantRoute, /No interpretation or recommendation was provided/);
  assert.match(assistantRoute, /collection\('brokerEscalations'\)/);
  assert.match(assistantRoute, /broker_question_escalated/);
});

test('escalations retain the agent, exact question, concise transaction context, relevant sources, reason, and direct review link', () => {
  for (const field of ['agentUid', 'agentName', 'transactionId', 'transactionContext', 'question', 'relevantKnowledge', 'aiInformationProvided', 'escalationReason']) assert.match(assistantRoute, new RegExp(field));
  assert.match(assistantRoute, /dashboard\/admin\/ask-your-broker\?escalation=/);
  assert.match(assistantRoute, /askYourBrokerEscalationUids/);
});

test('a broker response returns to the asking agent and answer promotion to approved knowledge is explicit rather than automatic', () => {
  assert.match(reviewRoute, /broker_question_answered/);
  assert.match(reviewRoute, /if \(body\.addToKnowledgeBase === true\)/);
  assert.match(adminPage, /Add this answer to Ask Your Broker Knowledge Base/);
  assert.match(agentPage, /brokerAnswer/);
});

test('the assistant has a branded agent entry point and configurable escalation recipients rather than hard-coded Keaty contacts', () => {
  assert.match(agentPage, /askYourBrokerName/);
  assert.match(brandingRoute, /askYourBrokerName/);
  assert.match(brandingRoute, /askYourBrokerEscalationUids/);
  assert.doesNotMatch(assistantRoute, /@keatyrealestate\.com/i);
});
