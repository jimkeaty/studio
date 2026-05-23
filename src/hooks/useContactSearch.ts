'use client';
import { useState, useCallback, useRef } from 'react';
import { useUser } from '@/firebase';

export type ContactType = 'client' | 'lender' | 'title' | 'other_agent' | 'inspector';

export type SavedContact = {
  id: string;
  type: ContactType;
  name?: string;
  companyName?: string;
  officerName?: string;
  email?: string;
  phone?: string;
  office?: string;
  attorney?: string;
  brokerage?: string;
  newAddress?: string;
  usageCount?: number;
};

export function useContactSearch(type: ContactType) {
  const { user } = useUser();
  const [results, setResults] = useState<SavedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q || q.length < 1) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        if (!user) return;
        setLoading(true);
        try {
          const token = await user.getIdToken();
          const params = new URLSearchParams({ type, q, limit: '10' });
          const res = await fetch(`/api/contacts?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (data.ok) setResults(data.contacts || []);
        } catch {
          // silent
        } finally {
          setLoading(false);
        }
      }, 200);
    },
    [user, type]
  );

  const saveContact = useCallback(
    async (fields: Record<string, any>) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        await fetch('/api/contacts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type, upsert: true, ...fields }),
        });
      } catch {
        // non-fatal
      }
    },
    [user, type]
  );

  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, saveContact, clear };
}
