"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { fetchShoppingList, markPurchased } from "@/lib/shoppingList";
import type { ShoppingListItem } from "@/lib/types";

export default function ShoppingListPage() {
  const { householdId } = useAuth();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!householdId) return;
    setLoading(true);
    setItems(await fetchShoppingList(householdId));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  async function handlePurchased(id: string) {
    await markPurchased(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="mb-1 text-xl font-bold tracking-tight text-deep">Shopping list</h1>
      <p className="item-meta mb-4">Items flagged for restock.</p>

      {loading ? (
        <p className="item-meta">Loading…</p>
      ) : items.length === 0 ? (
        <p className="item-meta">Nothing on the list yet.</p>
      ) : (
        <div className="space-y-2 pb-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-card border border-line bg-paper p-3">
              <span className="item-name flex-1">{item.item_name}</span>
              <button onClick={() => handlePurchased(item.id)} className="pill-secondary flex items-center gap-1">
                <Check size={14} /> Purchased
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
