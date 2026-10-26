"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { CalendarDays, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { addPackages, addToList, ensureProduct, removeFromList, saveSettings, setChecked } from "@/lib/db";
import { recommendations, qtyLabel } from "@/lib/insights";
import { findExact } from "@/lib/normalize";
import { type Category, type Product, type ShoppingListItem, type Unit, UNITS, categoryMeta } from "@/lib/types";
import { fmtNum, fromBase, toBase, unitKind } from "@/lib/units";
import { parseDay, todayISO } from "@/lib/dates";
import { Spinner } from "@/components/ui";
import ProductCombobox from "@/components/ProductCombobox";

function nextTrip(lastTrip: string | null, every: number) {
  const today = parseDay(todayISO());
  let next = lastTrip ? addDays(parseDay(lastTrip), every) : today;
  while (next < today) next = addDays(next, every);
  return next;
}

/** Pre-fill size/unit for a checked list item. */
function prefill(item: ShoppingListItem, product: Product | undefined): { size: string; unit: Unit; count: number } {
  const m = item.quantity_text?.match(/^\s*(\d+(?:\.\d+)?)\s*(oz|lb|g|kg|ml|l)?\b/i);
  if (product?.default_package_size) {
    const size = fmtNum(fromBase(product.default_package_size, product.display_unit));
    let count = 1;
    if (m && m[2] && unitKind(m[2].toLowerCase()) === product.unit_kind) {
      count = Math.max(1, Math.round(toBase(Number(m[1]), m[2].toLowerCase()) / product.default_package_size));
    } else if (m && !m[2] && product.unit_kind === "count") {
      count = Math.max(1, Math.round(Number(m[1]) / product.default_package_size));
    }
    return { size, unit: product.display_unit, count };
  }
  if (m && m[2]) return { size: m[1], unit: m[2].toLowerCase() as Unit, count: 1 };
  if (m) return { size: product?.unit_kind === "count" || !product ? m[1] : "1", unit: product?.display_unit ?? "count", count: 1 };
  return { size: "1", unit: product?.display_unit ?? "count", count: 1 };
}

export default function ShoppingListPage() {
  const { householdId, user } = useAuth();
  const k = useKitchen();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Record<string, { size: string; unit: Unit; count: number }> | null>(null);

  const trip = nextTrip(k.settings.last_trip_at, k.settings.shop_every_days);
  const onList = new Set(k.list.filter((l) => !l.checked && l.product_id).map((l) => l.product_id));
  const suggested = useMemo(
    () => recommendations(k.ctx).filter((r) => r.type === "buy" && !onList.has(r.product.id) && k.dismissed[r.product.id] !== r.signature),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [k.ctx, k.list, k.dismissed]
  );
  const items = useMemo(() => [...k.list].sort((a, b) => Number(a.checked) - Number(b.checked) || (a.created_at < b.created_at ? -1 : 1)), [k.list]);
  const checked = k.list.filter((l) => l.checked);

  async function add(name: string, product: Product | null, source: "manual" | "suggested" = "manual", qty: string | null = null) {
    if (!householdId || !name.trim()) return;
    const p = product ?? findExact(name, k.products) ?? null;
    const category: Category = p?.category ?? "other";
    const qtyText = qty ?? (p?.default_package_size ? qtyLabel(p, p.default_package_size) : null);
    await addToList(householdId, { name: p?.name ?? name.trim(), category, productId: p?.id ?? null, quantityText: qtyText, source }, user?.id ?? null);
    setQ("");
    await k.reload();
  }

  async function toggle(item: ShoppingListItem) {
    await setChecked(item.id, !item.checked);
    await k.reload();
  }

  function openReview() {
    const r: Record<string, { size: string; unit: Unit; count: number }> = {};
    checked.forEach((it) => (r[it.id] = prefill(it, k.productById(it.product_id))));
    setReview(r);
  }

  async function addCheckedToKitchen() {
    if (!householdId || !review) return;
    setBusy(true);
    try {
      for (const it of checked) {
        const v = review[it.id];
        const size = Number(v.size.replace(",", "."));
        if (!(size > 0)) continue;
        let product = k.productById(it.product_id) ?? findExact(it.item_name, k.products) ?? null;
        if (!product) product = await ensureProduct(householdId, it.item_name, it.category, v.unit);
        const shelf = product.default_shelf_life_days ?? categoryMeta(product.category).shelfLifeDays;
        await addPackages({
          householdId,
          userId: user?.id ?? null,
          product,
          typedName: it.item_name,
          category: product.category,
          size,
          unit: v.unit,
          count: v.count,
          expires: shelf ? format(addDays(new Date(), shelf), "yyyy-MM-dd") : null,
          addedAt: todayISO(),
          source: "shopping_list",
        });
        await removeFromList(it.id);
      }
      await saveSettings({ ...k.settings, household_id: householdId, last_trip_at: todayISO() });
      await k.reload();
      k.toast(`Added ${checked.length} item${checked.length === 1 ? "" : "s"} to your kitchen`);
      setReview(null);
    } finally {
      setBusy(false);
    }
  }

  async function clearChecked() {
    setBusy(true);
    for (const it of checked) await removeFromList(it.id);
    await k.reload();
    setBusy(false);
    setReview(null);
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <header className="px-5 pb-1.5 pt-[18px]">
        <h1 className="d m-0 text-[30px] font-extrabold">Shopping list</h1>
        <Link href="/settings" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-[5px] text-[13px] font-semibold text-[#3E4F45] shadow-soft">
          <CalendarDays size={16} strokeWidth={1.9} aria-hidden />
          Next trip {format(trip, "EEEE, MMM d")}
        </Link>
      </header>

      <main className="flex flex-col gap-5 px-5 pt-3.5">
        <form
          className="flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(q, null);
          }}
        >
          <div className="min-w-0 flex-1">
            <ProductCombobox id="list-add" value={q} onChange={setQ} onPick={(p) => add(p.name, p)} onCreate={() => add(q, null)} chosenId={null} placeholder="Add to list…" compact />
          </div>
          <button type="submit" aria-label="Add to list" className="mt-[5px] flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary text-white">
            <Plus size={22} strokeWidth={2.4} aria-hidden />
          </button>
        </form>

        {!k.ready ? (
          <Spinner />
        ) : (
          <>
            {suggested.length > 0 && (
              <section aria-labelledby="sug-h" className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <h2 id="sug-h" className="eyebrow">
                    Suggested for you
                  </h2>
                  <Link href="/insights" className="text-sm font-bold text-primary">
                    How?
                  </Link>
                </div>
                {suggested.map((s) => (
                  <div key={s.product.id} className="flex items-center gap-3 rounded-[20px] bg-ink p-3 text-white">
                    <span className="h-10 w-10 flex-none rounded-[13px]" style={{ background: categoryMeta(s.product.category).tint }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold">
                        {s.product.name} <span className="font-medium text-on-dark-faint">· {s.qtyLabel}</span>
                      </div>
                      <div className="mt-0.5 text-[13px] text-on-dark-muted">
                        {s.shortLead} · {s.short}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => add(s.product.name, s.product, "suggested", s.qtyLabel ?? null)}
                      className="h-11 flex-none rounded-[14px] bg-accent px-[18px] text-[15px] font-extrabold text-ink"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </section>
            )}

            <section aria-labelledby="list-h" className="flex flex-col gap-2.5">
              <h2 id="list-h" className="eyebrow">
                My list · {k.list.length}
              </h2>
              {items.length === 0 ? (
                <div className="card p-5 text-center text-sm text-muted">Nothing on the list. Add something above, or tap Add on a suggestion.</div>
              ) : (
                <div className="card overflow-hidden py-1">
                  {items.map((it) => {
                    const meta = categoryMeta(it.category);
                    return (
                      <div key={it.id} className="flex min-h-[62px] items-center gap-3.5 py-1.5 pl-4 pr-2">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5">
                          <input type="checkbox" checked={it.checked} onChange={() => toggle(it)} className="m-0 h-6 w-6 flex-none accent-primary" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className={`text-base font-bold ${it.checked ? "text-muted line-through" : ""}`}>{it.item_name}</span>
                            <span className="text-[13px] text-muted">
                              {meta.label}
                              {it.quantity_text ? ` · ${it.quantity_text}` : ""}
                              {it.source === "suggested" ? " · suggested" : ""}
                            </span>
                          </span>
                        </label>
                        <span className="h-3 w-3 flex-none rounded-full" style={{ background: meta.tint }} aria-hidden />
                        <button type="button" aria-label={`Remove ${it.item_name}`} onClick={async () => (await removeFromList(it.id), await k.reload())} className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-muted">
                          <X size={18} aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {checked.length > 0 && (
              <div className="flex flex-col gap-2.5 rounded-[22px] bg-primary-tint p-[18px]">
                <div className="d text-[19px] font-extrabold">
                  {checked.length} item{checked.length === 1 ? "" : "s"} in the cart
                </div>
                {!review ? (
                  <>
                    <div className="text-sm leading-[1.45] text-[#2E4A3B]">Checked items go straight into your kitchen with today’s date, so there’s nothing to re-type.</div>
                    <button type="button" onClick={openReview} className="btn-primary mt-0.5 h-[52px] text-base shadow-[0_8px_20px_rgba(21,128,61,.28)]">
                      Add checked to kitchen
                    </button>
                    <button type="button" onClick={clearChecked} disabled={busy} className="h-11 text-sm font-bold text-primary-tint-ink">
                      Just clear them from the list
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-[#2E4A3B]">Check the amounts, then add.</div>
                    {checked.map((it) => {
                      const v = review[it.id];
                      const product = k.productById(it.product_id);
                      const set = (patch: Partial<typeof v>) => setReview((r) => ({ ...r!, [it.id]: { ...r![it.id], ...patch } }));
                      return (
                        <div key={it.id} className="flex flex-col gap-2 rounded-[18px] bg-surface p-3">
                          <div className="font-bold">{it.item_name}</div>
                          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <input
                              aria-label={`${it.item_name} size`}
                              className="fld !h-12"
                              inputMode="decimal"
                              value={v.size}
                              onChange={(e) => set({ size: e.target.value.replace(/[^0-9.,]/g, "") })}
                            />
                            <select aria-label={`${it.item_name} unit`} className="fld !h-12" value={v.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>
                              {UNITS.filter((u) => !product || unitKind(u) === product.unit_kind).map((u) => (
                                <option key={u}>{u}</option>
                              ))}
                            </select>
                            <div className="flex h-12 items-center rounded-2xl bg-ink px-1 text-white" role="group" aria-label={`${it.item_name} packages`}>
                              <button type="button" aria-label="Fewer packages" onClick={() => set({ count: Math.max(1, v.count - 1) })} className="h-11 w-8 text-xl text-accent">
                                −
                              </button>
                              <span className="d w-6 text-center font-extrabold">{v.count}</span>
                              <button type="button" aria-label="More packages" onClick={() => set({ count: v.count + 1 })} className="h-11 w-8 text-xl text-accent">
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button type="button" disabled={busy} onClick={addCheckedToKitchen} className="btn-primary h-[52px] text-base">
                      {busy ? "Adding…" : `Add ${checked.length} to kitchen`}
                    </button>
                    <button type="button" onClick={() => setReview(null)} className="h-11 text-sm font-bold text-primary-tint-ink">
                      Back
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
