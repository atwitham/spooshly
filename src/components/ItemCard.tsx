"use client";

import { useState } from "react";
import type { InventoryItem } from "@/lib/types";
import { removeFromInventory } from "@/lib/inventory";
import { useAuth } from "@/lib/AuthProvider";

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000;
  return Math.round(diff);
}

export default function ItemCard({
  item,
  onChanged,
}: {
  item: InventoryItem;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(item.quantity);
  const [reason, setReason] = useState<"used" | "expired" | "other">("used");
  const [busy, setBusy] = useState(false);

  const days = daysUntil(item.expiration_date);
  const expiryColor =
    days === null ? "text-gray-400" : days < 0 ? "text-red-600" : days <= 5 ? "text-amber-600" : "text-gray-500";

  async function handleRemove() {
    setBusy(true);
    try {
      await removeFromInventory(item, amount, reason, user?.id ?? null);
      setOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo_url} alt={item.name} className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-xl">
            🍽️
          </div>
        )}
        <div className="flex-1">
          <p className="font-medium leading-tight">{item.name}</p>
          <p className="text-sm text-gray-500">
            {item.quantity} {item.unit}
          </p>
          {item.expiration_date && (
            <p className={`text-xs ${expiryColor}`}>
              {days !== null && days < 0
                ? `Expired ${Math.abs(days)}d ago`
                : `Expires in ${days}d (${item.expiration_date})`}
            </p>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700"
        >
          Use / Remove
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h3 className="mb-3 font-semibold">{item.name}</h3>
            <label className="mb-1 block text-sm text-gray-600">
              Amount to remove ({item.unit})
            </label>
            <input
              type="number"
              min={0}
              max={item.quantity}
              step="any"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <label className="mb-1 block text-sm text-gray-600">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="used">Used in cooking</option>
              <option value="expired">Expired / thrown out</option>
              <option value="other">Other</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={busy || amount <= 0}
                className="flex-1 rounded-lg bg-brand-600 py-2 font-medium text-white disabled:opacity-60"
              >
                {busy ? "Removing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
