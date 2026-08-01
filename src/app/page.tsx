"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Beef, FlaskConical, Droplet, Bath, Apple, Package, Box } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { CATEGORIES, type Category, type InventoryItem } from "@/lib/types";
import { fetchCategoryCounts, fetchExpiringSoon, removeFromInventory } from "@/lib/inventory";

const ICONS: Record<Category, typeof Beef> = {
  meat: Beef,
  seasoning: FlaskConical,
  oil: Droplet,
  essentials: Bath,
  produce: Apple,
  pantry: Package,
  other: Box,
};

export default function HomePage() {
  const { householdId, displayName, user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [expiring, setExpiring] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!householdId) return;
    setLoading(true);
    const [c, e] = await Promise.all([
      fetchCategoryCounts(householdId),
      fetchExpiringSoon(householdId),
    ]);
    setCounts(c);
    setExpiring(e);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  async function handleRemoveExpiring(item: InventoryItem) {
    await removeFromInventory(item, item.quantity, "used", user?.id ?? null);
    load();
  }

  if (!householdId && !loading) {
    return (
      <div className="p-6 text-center item-meta">
        <p className="mb-2 item-name">You&apos;re signed in, but not yet in a household.</p>
        <p>Ask whoever set up this app to add your account to the household in Supabase, then reload.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <p className="item-name">Hi {displayName ?? "there"}</p>
      <p className="item-meta mb-5">Here&apos;s what&apos;s in the kitchen.</p>

      {expiring.length > 0 && (
        <div className="mb-6">
          <p className="section-label mb-2">Expiring soon</p>
          <div className="space-y-2">
            {expiring.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-card border border-line bg-paper p-3">
                <span className="flex-1">
                  <span className="item-name">{item.name}</span>
                  <span className="item-meta"> · {item.quantity} {item.unit}</span>
                </span>
                <button onClick={() => handleRemoveExpiring(item)} className="pill-secondary">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="section-label mb-2">Categories</p>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => {
          const Icon = ICONS[cat.value];
          return (
            <Link
              key={cat.value}
              href={`/category/${cat.value}`}
              className="rounded-card border border-line bg-paper p-4 text-center"
            >
              <Icon size={22} color="#17A45E" className="mx-auto" />
              <div className="item-name mt-2">{cat.label}</div>
              <div className="item-meta">{counts[cat.value] ?? 0} items</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
