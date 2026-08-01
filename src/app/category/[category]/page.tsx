"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Beef, FlaskConical, Droplet, Bath, Apple, Package, Box } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { fetchItems } from "@/lib/inventory";
import { CATEGORIES, type Category, type InventoryItem } from "@/lib/types";
import MeatGroupList from "@/components/MeatGroupList";
import SimpleItemList from "@/components/SimpleItemList";

const ICONS: Record<Category, typeof Beef> = {
  meat: Beef,
  seasoning: FlaskConical,
  oil: Droplet,
  essentials: Bath,
  produce: Apple,
  pantry: Package,
  other: Box,
};

export default function CategoryPage() {
  const params = useParams<{ category: string }>();
  const category = params.category as Category;
  const meta = CATEGORIES.find((c) => c.value === category);
  const Icon = ICONS[category] ?? Box;
  const { householdId } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!householdId) return;
    setLoading(true);
    setItems(await fetchItems(householdId, category));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, category]);

  const filtered = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())),
    [items, q]
  );

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-deep">
        <ArrowLeft size={16} /> Back
      </Link>
      <h1 className="mb-3 mt-1 flex items-center gap-2 text-xl font-bold tracking-tight text-deep">
        <Icon size={20} color="#17A45E" /> {meta?.label ?? category}
      </h1>
      <input
        placeholder={`Search ${meta?.label.toLowerCase() ?? ""}...`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 w-full rounded-lg border border-line bg-paper px-3 py-2"
      />

      {loading ? (
        <p className="item-meta">Loading…</p>
      ) : category === "meat" ? (
        <MeatGroupList items={filtered} onChanged={load} />
      ) : (
        <SimpleItemList
          items={filtered}
          category={category}
          emptyLabel={`Nothing in ${meta?.label ?? category} yet.`}
          onChanged={load}
        />
      )}
    </div>
  );
}
