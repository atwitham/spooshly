"use client";

import { useState } from "react";
import type { InventoryItem, Category } from "@/lib/types";
import { STEPPER_CATEGORIES } from "@/lib/types";
import { restockItem, adjustQuantity } from "@/lib/inventory";
import { useAuth } from "@/lib/AuthProvider";

export default function SimpleItemList({
  items,
  category,
  emptyLabel,
  onChanged,
}: {
  items: InventoryItem[];
  category: Category;
  emptyLabel: string;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const showStepper = STEPPER_CATEGORIES.includes(category);

  async function handleRestock(item: InventoryItem) {
    setBusyId(item.id);
    try {
      await restockItem(item, user?.id ?? null);
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdjust(item: InventoryItem, delta: number) {
    setBusyId(item.id);
    try {
      await adjustQuantity(item, delta);
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="item-meta">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2 pb-4">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 rounded-card border border-line bg-paper p-3">
          <span className="item-name flex-1">{item.name}</span>

          {showStepper && (
            <div className="flex items-center gap-1">
              <button onClick={() => handleAdjust(item, -1)} disabled={busyId === item.id} className="pill-secondary px-2 py-1">
                −
              </button>
              <span className="item-meta w-6 text-center">{item.quantity}</span>
              <button onClick={() => handleAdjust(item, 1)} disabled={busyId === item.id} className="pill-secondary px-2 py-1">
                +
              </button>
            </div>
          )}
          {!showStepper && <span className="item-meta">{item.quantity} {item.unit}</span>}

          <button
            onClick={() => handleRestock(item)}
            disabled={busyId === item.id}
            className="pill-restock"
          >
            Restock
          </button>
        </div>
      ))}
    </div>
  );
}
