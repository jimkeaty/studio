'use client';

import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  orderBy,
  limit,
  startAt,
  endAt,
} from 'firebase/firestore';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import type { DailyActivity, AppointmentLog } from './types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// TODO: In a real app, this would come from a user profile or brokerage config.
// For now, we use the UID directly as the agentId.
export const getAgentId = (user: { uid: string }) => user.uid;

// --- DailyActivity Functions ---

export async function getDailyActivity(db: Firestore, agentId: string, date: string): Promise<DailyActivity | null> {
  const docId = `${agentId}_${date}`;
  const ref = doc(db, 'daily_activity', docId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as DailyActivity;
  } catch (err) {
    const permissionError = new FirestorePermissionError({
      path: ref.path,
      operation: 'get',
    });
    errorEmitter.emit('permission-error', permissionError);
    throw err;
  }
}

export async function listDailyActivitiesForMonth(db: Firestore, agentId: string, year: number, month: number): Promise<DailyActivity[]> {
  const monthStr = String(month + 1).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = format(endOfMonth(new Date(year, month)), 'yyyy-MM-dd');
  
  const q = query(
    collection(db, 'daily_activity'),
    where('agentId', '==', agentId),
    orderBy('date'),
    startAt(startDate),
    endAt(endDate)
  );

  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyActivity));
  } catch (err) {
    const permissionError = new FirestorePermissionError({
      path: 'daily_activity',
      operation: 'list',
    });
    errorEmitter.emit('permission-error', permissionError);
    throw err;
  }
}

export async function upsertDailyActivity(db: Firestore, agentId: string, uid: string, date: string, data: Partial<Omit<DailyActivity, 'id' | 'agentId' | 'date'>>) {
    const docId = `${agentId}_${date}`;
    const ref = doc(db, 'daily_activity', docId);
    const dataToSave = {
        ...data,
        agentId,
        date,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
    };
    
    return setDoc(ref, dataToSave, { merge: true }).catch((err) => {
        const permissionError = new FirestorePermissionError({
            path: ref.path,
            operation: 'update',
            requestResourceData: dataToSave,
        });
        errorEmitter.emit('permission-error', permissionError);
        throw err;
    });
}

// --- AppointmentLog Functions ---

export async function addAppointmentLog(db: Firestore, agentId: string, uid: string, data: Omit<AppointmentLog, 'id' | 'agentId' | 'createdAt' | 'createdByUid'>): Promise<string> {
    const ref = collection(db, 'appointment_logs');
    const dataToSave = {
        ...data,
        agentId,
        createdAt: serverTimestamp(),
        createdByUid: uid,
    };
    try {
        const docRef = await addDoc(ref, dataToSave);
        return docRef.id;
    } catch (err) {
        const permissionError = new FirestorePermissionError({
            path: ref.path,
            operation: 'create',
            requestResourceData: dataToSave,
        });
        errorEmitter.emit('permission-error', permissionError);
        throw err;
    }
}

export async function listAppointmentLogsForDate(db: Firestore, agentId: string, date: string): Promise<AppointmentLog[]> {
    const q = query(
        collection(db, 'appointment_logs'),
        where('agentId', '==', agentId),
        where('date', '==', date)
        // Ordering by a field different from the where() clauses requires a composite index.
        // To avoid this, we sort the results in memory.
        // orderBy('createdAt', 'desc')
    );
    try {
        const snap = await getDocs(q);
        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppointmentLog));
        // Sort logs by creation time, newest first.
        logs.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        return logs;
    } catch (err) {
        const permissionError = new FirestorePermissionError({
            path: 'appointment_logs',
            operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        throw err;
    }
}

export async function listAppointmentLogsForRange(
    db: Firestore, 
    agentId: string, 
    startDate: Date, 
    endDate: Date, 
    filters: { category?: 'buyer' | 'seller', status?: 'set' | 'held' }
): Promise<AppointmentLog[]> {
    const qConstraints = [
        where('agentId', '==', agentId),
        where('date', '>=', format(startDate, 'yyyy-MM-dd')),
        where('date', '<=', format(endDate, 'yyyy-MM-dd')),
    ];
    if (filters.category) {
        qConstraints.push(where('category', '==', filters.category));
    }
    if (filters.status) {
        qConstraints.push(where('status', '==', filters.status));
    }
    qConstraints.push(orderBy('date', 'desc'));

    const q = query(collection(db, 'appointment_logs'), ...qConstraints);
    try {
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppointmentLog));
    } catch (err) {
        const permissionError = new FirestorePermissionError({
            path: 'appointment_logs',
            operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        throw err;
    }
}

export async function deleteAppointmentLog(db: Firestore, id: string) {
    const ref = doc(db, 'appointment_logs', id);
    return deleteDoc(ref).catch((err) => {
        const permissionError = new FirestorePermissionError({
            path: ref.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
        throw err;
    });
}

export async function findSimilarAppointment(
    db: Firestore, 
    agentId: string, 
    contactName: string, 
    status: 'set' | 'held'
): Promise<AppointmentLog | null> {
    const sixtyDaysAgo = format(subDays(new Date(), 60), 'yyyy-MM-dd');
    const q = query(
        collection(db, 'appointment_logs'),
        where('agentId', '==', agentId),
        where('contactName', '==', contactName),
        where('status', '==', status),
        where('date', '>=', sixtyDaysAgo),
        orderBy('date', 'desc'),
        limit(1)
    );
    try {
        const snap = await getDocs(q);
        if (snap.empty) {
            return null;
        }
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as AppointmentLog;
    } catch (err) {
        const permissionError = new FirestorePermissionError({
            path: 'appointment_logs',
            operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        throw err;
    }
}
