"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Search, ShoppingCart, X } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { addToList } from "@/lib/db";
import { onHandBase, recommendations, runway, runwayShort } from "@/lib/insights";
import { matchesQuery } from "@/lib/normalize";
import { CATEGORIES, type InventoryItem, type Product } from "@/lib/types";
import { formatQty, formatStored } from "@/lib/units";
import { daysUntil, expiryChip, fmtDay } from "@/lib/dates";
import { CategoryIcon, CategoryTile, Spinner, StatusChip, Wordmark } from "@/components/ui";
import UseSheet from "@/components/UseSheet";

export default function HomePage() {
  const { displayName, householdId, user } = useAuth();
  const k = useKitchen();
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<{ pkg: InventoryItem; product: Product; reason: "cooked" | "expired" } | null>(null);
  const [adding, setAdding] = useState(false);

  const name = (displayName ?? "there").split(/[@\s]/)[0];
  const r = useMemo(() => runway(k.ctx), [k.ctx]);
  const recs = useMemo(() => {
    const onList = new Set(k.list.filter((l) => !l.checked && l.product_id).map((l) => l.product_id));
    return recommendations(k.ctx)
      .filter((x) => x.type === "buy" && !onList.has(x.product.id) && k.dismissed[x.product.id] !== x.signature)
      .slice(0, 3);
  }, [k.ctx, k.list, k.dismissed]);

  const useSoon = useMemo(() => {
    const days = k.settings.expiry_reminder_days;
    return k.packages
      .filter((p) => {
        const d = daysUntil(p.expiration_date);
        return d !== null && d <= days;
      })
      .sort((a, b) => (a.expiration_date! < b.expiration_date! ? -1 : 1));
  }, [k.packages, k.settings.expiry_reminder_days]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    k.packages.forEach((p) => (c[p.category] = (c[p.category] ?? 0) + 1));
    return c;
  }, [k.packages]);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return k.products.filter((p) => matchesQuery(q, p)).slice(0, 8);
  }, [q, k.products]);

  if (!householdId && k.ready) {
    return (
      <div className="p-6 text-center text-muted">
        <p className="mb-2 font-bold text-ink">You&apos;re signed in, but not yet in a household.</p>
        <p>Ask whoever set up this app to add your account to the household in Supabase, then reload.</p>
      </div>
    );
  }

  const nonEmpty = CATEGORIES.filter((c) => (counts[c.value] ?? 0) > 0);
  const empty = CATEGORIES.filter((c) => !(counts[c.value] ?? 0));

  async function addRecsToList() {
    if (!householdId) return;
    setAdding(true);
    try {
      for (const rec of recs) {
        await addToList(
          householdId,
          { name: rec.product.name, category: rec.product.category, productId: rec.product.id, quantityText: rec.qtyLabel ?? null, source: "suggested" },
          user?.id ?? null
        );
      }
      await k.reload();
      k.toast(`Added ${recs.length} to your list`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <header className="flex items-center justify-between px-5 pb-1 pt-4">
        <Wordmark />
        <Link
          href="/settings"
          aria-label="Profile and settings"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-tint text-[17px] font-extrabold text-primary-tint-ink"
        >
          {name.charAt(0).toUpperCase()}
        </Link>
      </header>

      <main className="flex flex-col gap-[22px] px-5 pt-4">
        <div>
          <p className="eyebrow">{format(new Date(), "EEEE, MMM d")}</p>
          <h1 className="d mt-1.5 text-[32px] font-extrabold leading-[1.05]">
            Hi {name},
            <br />
            <span className="font-bold text-muted">here’s your kitchen.</span>
          </h1>
        </div>

        {!k.ready ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Link href="/kitchen" className="card flex flex-col gap-0.5 !rounded-[18px] px-3.5 py-3">
                <span className="d text-2xl font-extrabold">{k.packages.length}</span>
                <span className="text-xs font-semibold text-muted">items stocked</span>
              </Link>
              <Link href="/insights" className="flex flex-col gap-0.5 rounded-[18px] bg-ink px-3.5 py-3">
                <span className="d text-2xl font-extrabold text-accent">{r.hasData ? runwayShort(r.months) : "—"}</span>
                <span className="text-xs font-semibold text-on-dark-muted">meat runway</span>
              </Link>
              <a href="#use-soon" className="flex flex-col gap-0.5 rounded-[18px] bg-warn-tint px-3.5 py-3">
                <span className="d text-2xl font-extrabold text-warn-ink">{useSoon.length}</span>
                <span className="text-xs font-semibold text-[#6E3D07]">use soon</span>
              </a>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="card flex h-[52px] items-center gap-2.5 !rounded-[18px] px-4 text-muted">
                <Search size={20} strokeWidth={1.9} aria-hidden />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search your kitchen…"
                  aria-label="Search your kitchen"
                  autoComplete="off"
                  className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none placeholder:text-muted"
                />
                {q && (
                  <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="flex h-10 w-10 items-center justify-center rounded-xl bg-chip">
                    <X size={18} aria-hidden />
                  </button>
                )}
              </label>
              {q.trim() && (
                <div className="card overflow-hidden py-1">
                  {results.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nothing matches “{q}”.</p>}
                  {results.map((p) => {
                    const n = k.packages.filter((x) => x.product_id === p.id).length;
                    return (
                      <Link key={p.id} href={`/category/${p.category}?open=${p.id}`} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                        <CategoryTile category={p.category} size={36} radius={11} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-bold">{p.name}</span>
                          <span className="text-xs text-muted">
                            {n > 0 ? `${formatQty(onHandBase(p, k.packages), p.unit_kind, p.display_unit)} · ${n} package${n === 1 ? "" : "s"}` : "None in stock"}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {recs.length > 0 && (
              <section aria-labelledby="restock-h" className="flex flex-col gap-3 rounded-[26px] bg-primary-tint p-[18px]">
                <div className="flex items-center justify-between">
                  <h2 id="restock-h" className="d m-0 text-xl font-extrabold">
                    Time to restock
                  </h2>
                  <Link href="/insights" className="text-sm font-bold text-primary-tint-ink underline-offset-2 hover:underline">
                    Why?
                  </Link>
                </div>
                {recs.map((rec) => (
                  <div key={rec.product.id} className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
                    <CategoryTile category={rec.product.category} />
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold">{rec.product.name}</div>
                      <div className="mt-px text-[13px] text-muted">
                        <span className={`font-bold ${rec.shortLead === "Out" ? "text-danger-ink" : "text-warn-ink"}`}>{rec.shortLead}</span> · {rec.short}
                      </div>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-chip px-2.5 py-1.5 text-[13px] font-bold">{rec.qtyLabel}</span>
                  </div>
                ))}
                <button type="button" disabled={adding} onClick={addRecsToList} className="btn-primary h-[50px] text-[15px] shadow-[0_6px_16px_rgba(21,128,61,.3)]">
                  <ShoppingCart size={20} strokeWidth={1.9} aria-hidden />
                  {recs.length === 1 ? "Add to list" : recs.length === 2 ? "Add both to list" : "Add all to list"}
                </button>
              </section>
            )}

            {useSoon.length > 0 && (
              <section id="use-soon" aria-labelledby="exp-h" className="flex scroll-mt-4 flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <h2 id="exp-h" className="eyebrow">
                    Use soon
                  </h2>
                  <Link href="/kitchen" className="text-sm font-bold text-primary">
                    See all
                  </Link>
                </div>
                {useSoon.slice(0, 6).map((pkg) => {
                  const product = k.productById(pkg.product_id);
                  const chip = expiryChip(pkg.expiration_date);
                  const expired = (daysUntil(pkg.expiration_date) ?? 0) < 0;
                  return (
                    <div key={pkg.id} className="card flex items-center gap-3 p-3">
                      <CategoryTile category={pkg.category} size={48} radius={16} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold">
                          {product?.name ?? pkg.name} <span className="font-medium text-muted">· {formatStored(pkg.quantity, pkg.unit)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          {chip && <StatusChip tone={chip.tone}>{chip.text}</StatusChip>}
                          <span className="text-muted">Added {fmtDay(pkg.added_at ?? pkg.created_at)}</span>
                        </div>
                      </div>
                      {product && (
                        <button
                          type="button"
                          onClick={() => setSheet({ pkg, product, reason: expired ? "expired" : "cooked" })}
                          className={`h-11 flex-none rounded-[14px] px-[18px] text-[15px] font-bold ${expired ? "bg-chip text-ink" : "bg-primary text-white"}`}
                        >
                          {expired ? "Toss" : "Use"}
                        </button>
                      )}
                    </div>
                  );
                })}
                {useSoon.length > 6 && <p className="text-center text-sm text-muted">+{useSoon.length - 6} more in your kitchen</p>}
              </section>
            )}

            <section aria-labelledby="cat-h" className="flex flex-col gap-2.5">
              <h2 id="cat-h" className="eyebrow">
                Categories
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                {nonEmpty.map((c) => (
                  <Link key={c.value} href={`/category/${c.value}`} className="card flex flex-col gap-3.5 p-4 transition-transform hover:-translate-y-px">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: c.tint, color: c.ink }}>
                      <CategoryIcon category={c.value} />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="d text-[17px] font-bold leading-tight">{c.label}</span>
                      <span className="text-[13px] text-muted">
                        {counts[c.value]} item{counts[c.value] === 1 ? "" : "s"}
                      </span>
                    </span>
                  </Link>
                ))}
                {empty.length > 0 && (
                  <Link href="/add" className="flex flex-col justify-center gap-1.5 rounded-[22px] border-2 border-dashed border-[#CBD5CC] p-4">
                    <span className="d text-base font-bold">{empty.length} empty</span>
                    <span className="text-[13px] leading-snug text-muted">{empty.map((c) => c.short).join(", ")}</span>
                    <span className="text-[13px] font-bold text-primary">+ Add first item</span>
                  </Link>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {sheet && <UseSheet pkg={sheet.pkg} product={sheet.product} initialReason={sheet.reason} onClose={() => setSheet(null)} />}
    </div>
  );
}

