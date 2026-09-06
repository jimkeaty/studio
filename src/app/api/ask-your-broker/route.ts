import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { buildTransactionContext, escalationReasonForQuestion, keywordScore } from '@/lib/askYourBroker';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function caller(req: NextRequest) {
  const bearer = req.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return null;
  try { return await adminAuth.verifyIdToken(bearer.slice(7)); } catch { return null; }
}

async function canUseTransaction(uid: string, transaction: Record<string, any>) {
  if (await isAdminLike(uid)) return true;
  if (String(transaction.agentId || '') === uid) return true;
  const profile = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
  const identifiers = new Set([uid]);
  if (!profile.empty) {
    identifiers.add(profile.docs[0].id);
    const data = profile.docs[0].data();
    if (data.agentId) identifiers.add(String(data.agentId));
  }
  return identifiers.has(String(transaction.agentId || '')) || identifiers.has(String(transaction.coAgent?.agentId || ''));
}

export async function GET(req: NextRequest) {
  const decoded = await caller(req);
  if (!decoded) return jsonError(401, 'Sign in is required');
  const escalationId = String(req.nextUrl.searchParams.get('escalation') || '').trim();
  if (!escalationId) return jsonError(400, 'Broker review request ID is required.');
  const escalation = await adminDb.collection('brokerEscalations').doc(escalationId).get();
  if (!escalation.exists) return jsonError(404, 'Broker review request not found.');
  const data = escalation.data() as Record<string, any>;
  if (data.agentUid !== decoded.uid && !(await isAdminLike(decoded.uid))) return jsonError(403, 'You do not have access to this broker review request.');
  return NextResponse.json({ ok: true, escalation: { id: escalation.id, ...data } });
}

export async function POST(req: NextRequest) {
  const decoded = await caller(req);
  if (!decoded) return jsonError(401, 'Sign in is required');
  const body = await req.json().catch(() => ({}));
  const question = String(body.question || '').trim();
  if (question.length < 3 || question.length > 5000) return jsonError(400, 'Enter a question between 3 and 5,000 characters.');

  let transaction: Record<string, any> | null = null;
  const transactionId = String(body.transactionId || '').trim();
  if (transactionId) {
    const snap = await adminDb.collection('transactions').doc(transactionId).get();
    if (!snap.exists) return jsonError(404, 'Transaction not found');
    transaction = { id: snap.id, ...snap.data() };
    if (!(await canUseTransaction(decoded.uid, transaction))) return jsonError(403, 'You do not have access to this transaction context.');
  }

  const context = buildTransactionContext(transaction);
  const knowledgeSnapshot = await adminDb.collection('brokerKnowledge').where('status', '==', 'approved').limit(100).get();
  const sources: Array<Record<string, any> & { score: number }> = knowledgeSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, any>))
    .map((entry) => ({ ...entry, score: keywordScore(question, entry) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4) as Array<Record<string, any> & { score: number }>;
  const escalationReason = escalationReasonForQuestion(question);
  const threadRef = adminDb.collection('brokerQuestionThreads').doc();

  if (escalationReason) {
    const branding = (await adminDb.collection('brandingSettings').doc('default').get()).data() || {};
    const escalationRef = adminDb.collection('brokerEscalations').doc();
    const payload = {
      status: 'pending',
      agentUid: decoded.uid,
      agentName: decoded.name || decoded.email || 'Agent',
      transactionId: transaction?.id || null,
      transactionContext: context,
      question,
      relevantKnowledge: sources.map(({ id, title, jurisdiction, formVersion, updatedAt }) => ({ id, title: title || 'Untitled', jurisdiction: jurisdiction || null, formVersion: formVersion || null, updatedAt: updatedAt || null })),
      aiInformationProvided: 'No interpretation or recommendation was provided. Broker review was requested.',
      escalationReason,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await escalationRef.set(payload);
    await threadRef.set({ ...payload, type: 'escalation', escalationId: escalationRef.id });
    const recipients = Array.isArray(branding.askYourBrokerEscalationUids) ? branding.askYourBrokerEscalationUids.filter(Boolean) : [];
    await sendNotification(adminDb, {
      type: 'broker_question_escalated',
      recipientUids: recipients,
      title: `${branding.askYourBrokerName || 'Ask Your Broker'} review requested`,
      body: `${payload.agentName} requested broker judgment${context?.property ? ` for ${context.property}` : ''}: ${question.slice(0, 280)}`,
      url: `/dashboard/admin/ask-your-broker?escalation=${escalationRef.id}`,
      data: { escalationId: escalationRef.id, agentUid: decoded.uid, transactionId: transaction?.id || '' },
    });
    return NextResponse.json({ ok: true, escalated: true, escalationId: escalationRef.id, answer: 'This question requires broker review. Your broker or designated reviewer has been notified. Do not rely on AI for an interpretation or recommendation while you wait.' });
  }

  const sourceText = sources.map((source, index) => `[${index + 1}] ${source.title || 'Untitled'} | ${source.jurisdiction || 'Unspecified jurisdiction'} | ${source.formVersion || 'Version not specified'} | Updated ${source.updatedAt || 'not specified'}\n${String(source.content || source.summary || '').slice(0, 6000)}`).join('\n\n');
  let answer: string;
  if (!sourceText) {
    answer = 'I could not find an approved brokerage source that answers this question. For Smart Broker navigation, describe what you are trying to do. For brokerage practice, contract, or risk questions, submit this to your broker for review.';
  } else {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'You are a brokerage help assistant. Answer only from the approved source material. Do not interpret contracts, recommend legal action, assert rights, invent policy, or give legal advice. If the sources do not answer it, say so and ask the agent to request broker review. Clearly identify sources by bracket number.' },
          { role: 'user', content: `Question:\n${question}\n\nTransaction summary (context only):\n${JSON.stringify(context)}\n\nApproved sources:\n${sourceText}` },
        ],
      });
      answer = completion.choices[0]?.message?.content?.trim() || 'No reliable answer was generated from approved brokerage sources.';
    } catch {
      answer = 'The approved-source assistant is temporarily unavailable. Please retry, or request broker review if this affects your transaction or judgment.';
    }
  }
  await threadRef.set({ type: 'answer', agentUid: decoded.uid, agentName: decoded.name || decoded.email || 'Agent', transactionId: transaction?.id || null, transactionContext: context, question, answer, sourceIds: sources.map((source) => source.id), createdAt: new Date(), updatedAt: new Date() });
  return NextResponse.json({ ok: true, escalated: false, threadId: threadRef.id, answer, sources: sources.map((source) => ({ id: source.id, title: source.title || 'Untitled', jurisdiction: source.jurisdiction || null, formVersion: source.formVersion || null, updatedAt: source.updatedAt || null, documentUrl: source.documentUrl || null })) });
}
