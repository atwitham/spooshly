"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { renameProduct } from "@/lib/db";
import { matchesQuery } from "@/lib/normalize";
import { CATEGORIES, type Category, type Product } from "@/lib/types";
import { BackButton, CategoryTile } from "@/components/ui";

function ProductRow({ p }: { p: Product }) {
  const { user } = useAuth();
  const k = useKitchen();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [category, setCategory] = useState<Category>(p.category);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = k.packages.filter((x) => x.product_id === p.id).length;

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await renameProduct(p, name, category, user?.id ?? null);
      await k.reload();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t save.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex min-h-[60px] w-full items-center gap-3 border-t border-divider px-4 py-2 text-left first:border-t-0">
        <CategoryTile category={p.category} size={36} radius={11} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold">{p.name}</span>
          <span className="truncate text-xs text-muted">
            {n} in stock{p.aliases.length ? ` · also “${p.aliases.join("”, “")}”` : ""}
          </span>
        </span>
        <span className="text-sm font-bold text-primary">Edit</span>
      </button>
    );

  return (
    <div className="flex flex-col gap-2 border-t border-divider bg-chip px-4 py-3 first:border-t-0">
      <label className="flex flex-col gap-1">
        <span className="lbl">Name</span>
        <input className="fld" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="flex flex-col gap-1">
        <span className="lbl">Category</span>
        <select className="fld" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted">The old name is kept as an alias, so typing it still finds this product.</p>
      {err && <p className="text-sm font-semibold text-danger-ink">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => (setEditing(false), setName(p.name), setCategory(p.category))} className="h-12 rounded-[14px] bg-surface font-bold">
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={save} className="btn-primary h-12 rounded-[14px]">
          Save
        </button>
      </div>
    </div>
  );
}

export default function ProductNamesPage() {
  const k = useKitchen();
  const [q, setQ] = useState("");
  const list = useMemo(
    () => [...k.products].filter((p) => !q.trim() || matchesQuery(q, p)).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [k.products, q]
  );
  return (
    <div className="mx-auto max-w-[560px]">
      <header className="flex items-center gap-3 px-5 pb-1.5 pt-4">
        <BackButton href="/settings" label="Back to settings" />
        <h1 className="d m-0 text-[26px] font-extrabold">Product names</h1>
      </header>
      <main className="flex flex-col gap-3 px-5 pt-3.5">
        <label className="card flex h-[52px] items-center gap-2.5 !rounded-[18px] px-4 text-muted">
          <Search size={20} strokeWidth={1.9} aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none" />
        </label>
        <div className="card overflow-hidden">
          {list.length === 0 && <p className="p-4 text-sm text-muted">No products.</p>}
          {list.map((p) => (
            <ProductRow key={p.id} p={p} />
          ))}
        </div>
      </main>
    </div>
  );
}
