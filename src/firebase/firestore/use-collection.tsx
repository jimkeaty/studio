'use client';
import { type Query, onSnapshot, type DocumentData, type QuerySnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export function useCollection<T = DocumentData>(query: Query<T> | null) {
    const [snapshot, setSnapshot] = useState<QuerySnapshot<T> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!query) {
            setSnapshot(null);
            setLoading(false);
            setError(null);
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
                console.error(`[useCollection] Error fetching collection:`, err);
                setError(err);
                setSnapshot(null);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [query]);

    return { snapshot, loading, error };
}
