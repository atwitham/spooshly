"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthProvider";
import { fetchActivity } from "@/lib/db";
import type { ActivityEntry } from "@/lib/types";
import { BackButton, Spinner } from "@/components/ui";

const TONE: Record<ActivityEntry["type"], string> = {
  add: "bg-primary-tint text-primary-tint-ink",
  use: "bg-primary-tint text-primary-tint-ink",
  toss: "bg-warn-tint text-warn-ink",
  edit: "bg-info-tint text-info-ink",
  delete: "bg-danger-tint text-danger-ink",
  merge: "bg-soft text-ink",
  reset: "bg-danger-tint text-danger-ink",
};

export default function ActivityPage() {
  const { householdId } = useAuth();
  const [items, setItems] = useState<ActivityEntry[] | null>(null);
  useEffect(() => {
    if (householdId) fetchActivity(householdId, { limit: 300 }).then(setItems).catch(() => setItems([]));
  }, [householdId]);

  return (
    <div className="mx-auto max-w-[560px]">
      <header className="flex items-center gap-3 px-5 pb-1.5 pt-4">
        <BackButton href="/settings" label="Back to settings" />
        <h1 className="d m-0 text-[26px] font-extrabold">Activity log</h1>
      </header>
      <main className="flex flex-col gap-3 px-5 pt-3.5">
        {!items ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="card p-5 text-center text-sm text-muted">Nothing yet. Adds, uses, tosses, edits and deletes from now on show up here.</div>
        ) : (
          <div className="card overflow-hidden">
            {items.map((a) => (
              <div key={a.id} className="flex items-start gap-3 border-t border-divider px-4 py-3 first:border-t-0">
                <span className={`mt-0.5 w-16 flex-none rounded-full py-[3px] text-center text-xs font-bold capitalize ${TONE[a.type]}`}>{a.type}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold">{a.summary ?? a.type}</span>
                  <span className="text-xs text-muted">{format(new Date(a.at), "MMM d, yyyy · h:mm a")}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
