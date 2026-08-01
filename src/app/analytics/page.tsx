"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { fetchUsageSummary, type UsageSummary } from "@/lib/analytics";

function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const presets = [
  { label: "1 mo", months: 1 },
  { label: "3 mo", months: 3 },
  { label: "9 mo", months: 9 },
  { label: "12 mo", months: 12 },
];

export default function AnalyticsPage() {
  const { householdId } = useAuth();
  const [months, setMonths] = useState(1);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!householdId) return;
    setLoading(true);
    const start = isoMonthsAgo(months);
    const end = new Date().toISOString().slice(0, 10);
    const data = await fetchUsageSummary(householdId, "meat", start, `${end}T23:59:59`);
    setSummary(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, months]);

  const weeklyAvg = summary ? (summary.totalAllItems / summary.days) * 7 : 0;

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight text-deep">Meat usage</h1>

      <div className="mb-4 flex gap-2">
        {presets.map((p) => (
          <button
            key={p.months}
            onClick={() => setMonths(p.months)}
            className="flex-1 rounded-full py-2 text-sm font-semibold"
            style={
              months === p.months
                ? { background: "#E9F6EE", color: "#17A45E" }
                : { background: "none", border: "1px solid #E7E5DD", color: "#123528" }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="item-meta">Loading…</p>
      ) : !summary || summary.rows.length === 0 ? (
        <p className="item-meta">No meat usage logged in this range yet.</p>
      ) : (
        <>
          <div className="mb-4 rounded-card bg-mist p-4">
            <p className="item-meta">Average weekly usage</p>
            <p className="text-2xl font-bold text-deep">{weeklyAvg.toFixed(1)} lb / week</p>
          </div>

          <div className="space-y-2 pb-4">
            {summary.rows.map((row) => (
              <div key={`${row.item_name}-${row.unit}`} className="rounded-card border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="item-name">{row.item_name}</span>
                  <span className="item-meta">
                    {row.total} {row.unit}
                  </span>
                </div>
                <p className="item-meta">
                  {row.entries} removal{row.entries !== 1 ? "s" : ""} · avg{" "}
                  {((row.total / summary.days) * 7).toFixed(1)} {row.unit}/week
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
