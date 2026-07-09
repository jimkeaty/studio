/**
 * GET  /api/agent/agent-tasks?transactionId=xxx
 *   Returns the agent task workflow for a transaction
 *
 * POST /api/agent/agent-tasks
 *   Creates or resets the agent task workflow for a transaction
 *   Body: { transactionId, workflowType: 'seller_workflow' | 'buyer_workflow', closingDate?: string }
 *
 * PATCH /api/agent/agent-tasks
 *   Check off a task or add a note
 *   Body: { transactionId, taskId, action: 'complete' | 'uncomplete' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getAgentTaskDef, AgentWorkflowType } from '@/lib/checklists/definitions';
// FirebaseFirestore types are available via adminDb

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function getUid(req: NextRequest): Promise<string | null> {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');

  const { searchParams } = new URL(req.url);
  const transactionId = searchParams.get('transactionId');
  if (!transactionId) return jsonError(400, 'transactionId is required');

  // Verify agent owns this transaction or is staff/admin
  const txDoc = await adminDb.collection('transactions').doc(transactionId).get();
  if (!txDoc.exists) return jsonError(404, 'Transaction not found');
  const txData = txDoc.data()!;

  const userDoc = await adminDb.collection('users').doc(uid).get();
  const role = userDoc.data()?.role || 'agent';
  const isStaff = ['admin', 'staff', 'tc'].includes(role);

  if (!isStaff && txData.agentId !== uid) return jsonError(403, 'Forbidden');

  const snap = await adminDb.collection('agentTasks')
    .where('transactionId', '==', transactionId)
    .get();

  if (snap.empty) {
    return NextResponse.json({ ok: true, tasks: null });
  }

  const doc = snap.docs[0];
  const docData = doc.data();
  // Normalize: return tasks as a flat array with the doc id attached
  const tasks = (docData.tasks || []).map((t: any) => ({ ...t }));
  return NextResponse.json({ ok: true, tasks, docId: doc.id, workflowType: docData.workflowType });
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');

  const { transactionId, workflowType, closingDate } = await req.json();
  if (!transactionId) return jsonError(400, 'transactionId is required');
  if (!workflowType) return jsonError(400, 'workflowType is required');

  const def = getAgentTaskDef(workflowType as AgentWorkflowType);
  if (!def) return jsonError(400, 'Invalid workflowType');

  const tasks = def.map(task => ({
    ...task,
    completed: false,
    completedAt: null,
  }));

  const now = new Date().toISOString();

  // Check if one already exists
  const existing = await adminDb.collection('agentTasks')
    .where('transactionId', '==', transactionId)
    .get();

  if (!existing.empty) {
    // Update existing
    await existing.docs[0].ref.update({
      workflowType,
      tasks,
      closingDate: closingDate || null,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, id: existing.docs[0].id });
  }

  const docRef = await adminDb.collection('agentTasks').add({
    transactionId,
    agentId: uid,
    workflowType,
    tasks,
    closingDate: closingDate || null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, id: docRef.id });
}

export async function PATCH(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');

  const body = await req.json();
  const { taskId, completed, transactionId, action } = body;
  if (!taskId) return jsonError(400, 'taskId is required');

  // Support both transactionId-based lookup and direct taskId lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docRef: any = null;
  let data: any = null;

  if (transactionId) {
    const snap = await adminDb.collection('agentTasks')
      .where('transactionId', '==', transactionId)
      .get();
    if (snap.empty) return jsonError(404, 'Agent tasks not found');
    docRef = snap.docs[0].ref;
    data = snap.docs[0].data();
  } else {
    // Try direct doc lookup by taskId as doc ID
    const snap = await adminDb.collection('agentTasks').doc(taskId).get();
    if (snap.exists) {
      docRef = snap.ref;
      data = snap.data();
    } else {
      return jsonError(404, 'Agent tasks not found');
    }
  }

  const now = new Date().toISOString();
  const isComplete = completed !== undefined ? !!completed : action === 'complete';

  const tasks = (data.tasks || []).map((task: any) => {
    if (task.id === taskId) {
      return {
        ...task,
        completed: isComplete,
        completedAt: isComplete ? now : null,
      };
    }
    return task;
  });

  if (!docRef) return jsonError(500, 'Could not locate task document');
  await docRef.update({ tasks, updatedAt: now });
  return NextResponse.json({ ok: true });
}
