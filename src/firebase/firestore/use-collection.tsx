'use client';
import { type Query, onSnapshot, type DocumentData, type QuerySnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError } from '../errors';

export function useCollection<T = DocumentData>(query: Query<T> | null) {
    const [snapshot, setSnapshot] = useState<QuerySnapshot<T> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!query) {
            setSnapshot(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        const unsubscribe = onSnapshot(query,
            (snap) => {
                setSnapshot(snap);
                setLoading(false);
                setError(null);
            },
            (err) => {
                // Attempt to construct a path for the error. This is best-effort.
                const path = (query as any)._query?.path?.segments?.join('/') ?? 'unknown collection';
                const permissionError = new FirestorePermissionError({
                    path: path,
                    operation: 'list',
                });
                errorEmitter.emit('permission-error', permissionError);
                setError(err);
                setSnapshot(null);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [query]);

    return { snapshot, loading, error };
}
