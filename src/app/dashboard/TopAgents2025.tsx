"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useFirestore } from "@/firebase";

type RollupDoc = {
  agentId: string;
  year: number;
  closed: number;
  pending: number;
  listings: { active: number; canceled: number; expired: number };
  totals: { transactions: number; listings: number; all: number };
  locked: boolean;
};

export default function TopAgents2025({ year = 2025 }: { year?: number }) {
  const db = useFirestore();

  const [rows, setRows] = useState<RollupDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!db) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const q = query(collection(db, "agentYearRollups"), where("year", "==", year));
        const snap = await getDocs(q);

        const data: RollupDoc[] = snap.docs
          .map((d) => d.data() as RollupDoc)
          .filter((x) => x && x.agentId && x.year);

        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, year]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => (b?.totals?.all || 0) - (a?.totals?.all || 0));
  }, [rows]);

  const totals = useMemo(() => {
    return sorted.reduce(
      (acc, r) => {
        acc.closed += r.closed || 0;
        acc.pending += r.pending || 0;
        acc.total += r?.totals?.all || 0;
        return acc;
      },
      { closed: 0, pending: 0, total: 0 }
    );
  }, [sorted]);

  if (!db) {
    return (
      <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
        Firestore not ready…
      </div>
    );
  }

  return (
    <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Top Agents ({year})</h2>
          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            Data source: Firestore → <code>agentYearRollups</code> where <code>year=={year}</code>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Total Closed</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{totals.closed}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Total Pending</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{totals.pending}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Total All</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{totals.total}</div>
          </div>
        </div>
      </div>

      {loading && <div style={{ marginTop: 14 }}>Loading…</div>}

      {!loading && error && (
        <div style={{ marginTop: 14, color: "#b91c1c" }}>
          <div style={{ fontWeight: 700 }}>Firestore read failed:</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "10px 8px" }}>Rank</th>
                <th style={{ padding: "10px 8px" }}>Agent ID</th>
                <th style={{ padding: "10px 8px" }}>Closed</th>
                <th style={{ padding: "10px 8px" }}>Pending</th>
                <th style={{ padding: "10px 8px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 25).map((r, idx) => (
                <tr key={`${r.agentId}_${r.year}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 8px" }}>{idx + 1}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <code>{r.agentId}</code>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{r.closed || 0}</td>
                  <td style={{ padding: "10px 8px" }}>{r.pending || 0}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 700 }}>{r?.totals?.all || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
            Showing top 25 of {sorted.length} rollups for {year}.
          </div>
        </div>
      )}
    </div>
  );
}
