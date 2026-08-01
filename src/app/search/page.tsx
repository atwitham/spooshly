"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthProvider";
import { fetchItems, restockItem } from "@/lib/inventory";
import type { InventoryItem } from "@/lib/types";

export default function SearchPage() {
  const { householdId, user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!householdId) return;
    setItems(await fetchItems(householdId));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  const filtered = useMemo(() => {
    if (!q.trim()) return [];
    return items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  }, [items, q]);

  async function handleRestock(item: InventoryItem) {
    setBusyId(item.id);
    try {
      await restockItem(item, user?.id ?? null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="mb-3 text-xl font-bold tracking-tight text-deep">Search inventory</h1>
      <input
        autoFocus
        placeholder="Search all items..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 w-full rounded-lg border border-line bg-paper px-3 py-2"
      />
      {q && filtered.length === 0 && <p className="item-meta">Nothing matches yet.</p>}
      <div className="space-y-2 pb-4">
        {filtered.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-card border border-line bg-paper p-3">
            <span className="flex-1">
              <span className="item-name">{item.name}</span>
              <span className="item-meta"> · {item.quantity} {item.unit}</span>
            </span>
            {item.category === "meat" ? (
              <Link href="/category/meat" className="pill-secondary">
                View
              </Link>
            ) : (
              <button onClick={() => handleRestock(item)} disabled={busyId === item.id} className="pill-restock">
                Restock
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
