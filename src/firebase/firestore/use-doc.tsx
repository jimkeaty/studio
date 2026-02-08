'use client';
import { type DocumentReference, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { FirestorePermissionError } from '../errors';
import { errorEmitter } from '../error-emitter';

export function useDoc<T = DocumentData>(ref: DocumentReference<T> | null) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!ref) {
            setData(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        const unsubscribe = onSnapshot(ref, 
            (snapshot) => {
                setData(snapshot.exists() ? snapshot.data() : null);
                setLoading(false);
                setError(null);
            },
            (err) => {
                const permissionError = new FirestorePermissionError({
                    path: ref.path,
                    operation: 'get',
                });
                errorEmitter.emit('permission-error', permissionError);
                setError(permissionError);
                setData(null);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [ref]);

    return { data, loading, error };
}
