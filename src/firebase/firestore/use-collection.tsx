'use client';
import { type Query, onSnapshot, type DocumentData, type QuerySnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { FirestorePermissionError } from '../errors';
import { errorEmitter } from '../error-emitter';

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
                // It's hard to reliably get the path from a query object without internal properties.
                // We'll signal it as a list operation on an unknown path.
                const permissionError = new FirestorePermissionError({
                    path: `Collection query (path unknown)`,
                    operation: 'list',
                });
                errorEmitter.emit('permission-error', permissionError);
                setError(permissionError);
                setSnapshot(null);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [query]);

    return { snapshot, loading, error };
}
