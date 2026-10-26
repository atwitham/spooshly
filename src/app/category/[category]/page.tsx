"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Info, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { duplicatePackage } from "@/lib/db";
import { onHandBase, weeksOnHand } from "@/lib/insights";
import { matchesQuery } from "@/lib/normalize";
import { CATEGORIES, type Category, type InventoryItem, type Product, categoryMeta } from "@/lib/types";
import { formatQty, formatStored } from "@/lib/units";
import { daysUntil, expiryChip, fmtDay, fmtMonth } from "@/lib/dates";
import { BackButton, CategoryIcon, CategoryTile, Spinner } from "@/components/ui";
import PackageMenu from "@/components/PackageMenu";
import UseSheet from "@/components/UseSheet";

type Sort = "expiring" | "newest" | "az";
const PREVIEW = 5;

const added = (p: InventoryItem) => p.added_at ?? p.created_at.slice(0, 10);
const expKey = (p: InventoryItem) => p.expiration_date ?? "9999-12-31";

function CategoryView() {
  const params = useParams<{ category: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const category = params.category as Category;
  const meta = categoryMeta(category);
  const { user } = useAuth();
  const k = useKitchen();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("expiring");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<{ pkg: InventoryItem; product: Product; reason: "cooked" | "expired" } | null>(null);
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("splooshly:lastCategory", category);
    } catch {
      /* ignore */
    }
  }, [category]);

  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => pickerRef.current && !pickerRef.current.contains(e.target as Node) && setPicker(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picker]);

  const groups = useMemo(() => {
    const pk = k.packages.filter((p) => p.category === category && p.product_id);
    const byProduct = new Map<string, InventoryItem[]>();
    pk.forEach((p) => byProduct.set(p.product_id!, [...(byProduct.get(p.product_id!) ?? []), p]));
    const list = Array.from(byProduct.entries())
      .map(([id, packages]) => ({ product: k.productById(id), packages }))
      .filter((g): g is { product: Product; packages: InventoryItem[] } => !!g.product)
      .filter((g) => !q.trim() || matchesQuery(q, g.product));
    list.forEach((g) =>
      g.packages.sort((a, b) =>
        sort === "newest" ? (added(a) < added(b) ? 1 : -1) : expKey(a) < expKey(b) ? -1 : expKey(a) > expKey(b) ? 1 : added(a) < added(b) ? -1 : 1
      )
    );
    return list.sort((a, b) => {
      if (sort === "az") return a.product.name.localeCompare(b.product.name);
      if (sort === "newest") {
        const la = a.packages.map(added).sort().at(-1)!;
        const lb = b.packages.map(added).sort().at(-1)!;
        return la < lb ? 1 : -1;
      }
      const ea = a.packages.map(expKey).sort()[0];
      const eb = b.packages.map(expKey).sort()[0];
      return ea < eb ? -1 : ea > eb ? 1 : a.product.name.localeCompare(b.product.name);
    });
  }, [k.packages, k, category, q, sort]);

  // Expand the requested product (from search) or the first group.
  const initial = search.get("open");
  useEffect(() => {
    if (!k.ready || groups.length === 0) return;
    setOpen((o) => (Object.keys(o).length ? o : { [initial ?? groups[0].product.id]: true }));
    if (initial) setTimeout(() => document.getElementById(`product-${initial}`)?.scrollIntoView({ block: "start" }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.ready, groups.length > 0]);

  const totalPackages = groups.reduce((s, g) => s + g.packages.length, 0);

  async function duplicate(pkg: InventoryItem, product: Product) {
    const undo = await duplicatePackage(pkg, user?.id ?? null);
    await k.reload();
    k.toast(`Added 1 × ${product.name}`, undo);
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <header className="flex items-center gap-3 px-5 pb-2 pt-4">
        <BackButton href="/" label="Back to home" />
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px]" style={{ background: meta.tint, color: meta.ink }}>
          <CategoryIcon category={category} />
        </span>
        <div ref={pickerRef} className="relative min-w-0 flex-1">
          <button type="button" aria-haspopup="listbox" aria-expanded={picker} onClick={() => setPicker((p) => !p)} className="flex max-w-full items-center gap-1 text-left">
            <h1 className="d m-0 truncate text-2xl font-extrabold leading-tight">{meta.label}</h1>
            <ChevronDown size={18} className="flex-none text-muted" aria-hidden />
          </button>
          <div className="text-[13px] text-muted">
            {totalPackages} package{totalPackages === 1 ? "" : "s"} · {groups.length} product{groups.length === 1 ? "" : "s"}
          </div>
          {picker && (
            <div role="listbox" aria-label="Switch category" className="absolute left-0 top-9 z-40 flex w-[240px] flex-col rounded-[18px] bg-surface p-1.5 shadow-menu">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  role="option"
                  aria-selected={c.value === category}
                  type="button"
                  onClick={() => (setPicker(false), router.push(`/category/${c.value}`))}
                  className={`flex h-[46px] items-center gap-3 rounded-xl px-2.5 text-left text-[15px] font-semibold ${c.value === category ? "bg-chip" : ""}`}
                >
                  <CategoryTile category={c.value} size={30} radius={9} />
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-col gap-3 px-5 pt-3">
        <label className="card flex h-[52px] items-center gap-2.5 !rounded-[18px] px-4 text-muted">
          <Search size={20} strokeWidth={1.9} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${meta.label.toLowerCase()}…`}
            aria-label={`Search ${meta.label}`}
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
        </label>

        <div role="group" aria-label="Sort" className="flex gap-2">
          {(
            [
              ["expiring", "Expiring first"],
              ["newest", "Newest"],
              ["az", "A–Z"],
            ] as [Sort, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={sort === v}
              onClick={() => setSort(v)}
              className={`h-[38px] rounded-full px-4 text-sm ${sort === v ? "bg-ink font-bold text-white" : "bg-surface font-semibold text-ink shadow-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!k.ready ? (
          <Spinner />
        ) : groups.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="font-bold">{q ? `Nothing matches “${q}”.` : `Nothing in ${meta.short} yet.`}</p>
            <Link href={`/add?category=${category}`} className="mt-2 inline-block text-sm font-bold text-primary">
              + Add {meta.short.toLowerCase()}
            </Link>
          </div>
        ) : (
          groups.map(({ product, packages }) => {
            const isOpen = !!open[product.id];
            const onHand = onHandBase(product, k.packages);
            const qty = formatQty(onHand, product.unit_kind, product.display_unit, { withLb: true });
            const weeks = weeksOnHand(product, k.ctx);
            const soonest = packages.find((p) => p.expiration_date);
            const soonChip = expiryChip(soonest?.expiration_date ?? null);
            const soonDays = daysUntil(soonest?.expiration_date ?? null);
            const shown = showAll[product.id] ? packages : packages.slice(0, PREVIEW);
            const toggle = () => setOpen((o) => ({ ...o, [product.id]: !isOpen }));
            return (
              <div key={product.id} id={`product-${product.id}`} className="card scroll-mt-4">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={toggle}
                  className="flex w-full items-start gap-3 rounded-[22px] bg-surface p-4 text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="d text-[19px] font-bold">{product.name}</span>
                    <span className="text-sm text-muted">
                      {qty} · {packages.length} package{packages.length === 1 ? "" : "s"}
                      {!isOpen &&
                        (soonChip && soonDays !== null && soonDays <= 30 ? (
                          <>
                            {" · "}
                            <span className={`font-bold ${soonChip.tone === "danger" ? "text-danger-ink" : "text-warn-ink"}`}>{soonChip.text}</span>
                          </>
                        ) : (
                          ` · added ${fmtDay(added(packages[packages.length - 1]))}`
                        ))}
                    </span>
                    {isOpen && weeks !== null && (
                      <span className="mt-1 flex items-center gap-2.5">
                        <span className="h-2 flex-1 overflow-hidden rounded bg-divider">
                          <span
                            className="block h-2 rounded bg-bar"
                            style={{ width: `${Math.min(100, Math.max(4, (weeks / (k.settings.target_supply_weeks * 7)) * 100))}%` }}
                          />
                        </span>
                        <span className="whitespace-nowrap rounded-full bg-primary-tint px-2 py-[3px] text-xs font-bold text-primary-tint-ink">
                          ~{Math.round(weeks)} wk{Math.round(weeks) === 1 ? "" : "s"}
                        </span>
                      </span>
                    )}
                  </span>
                  <ChevronDown size={22} className="mt-1 flex-none text-muted transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "none" }} aria-hidden />
                </button>

                {isOpen && (
                  <>
                    {shown.map((pkg) => {
                      const d = daysUntil(pkg.expiration_date);
                      const expired = d !== null && d < 0;
                      const size = formatStored(pkg.quantity, pkg.unit);
                      return (
                        <div key={pkg.id} className="flex items-center gap-2.5 border-t border-divider py-3 pl-4 pr-3" style={expired ? { background: "#FFF7F5" } : undefined}>
                          <div className="min-w-0 flex-1">
                            <div className="text-base font-bold">{size}</div>
                            <div className="mt-0.5 text-[13px] text-muted">
                              Added {fmtDay(added(pkg))}
                              {pkg.expiration_date && (
                                <>
                                  {" · "}
                                  {expired ? (
                                    <span className="font-bold text-danger-ink">Expired {fmtMonth(pkg.expiration_date)}</span>
                                  ) : (
                                    `Expires ${d !== null && d <= 31 ? fmtDay(pkg.expiration_date) : fmtMonth(pkg.expiration_date)}`
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSheet({ pkg, product, reason: "cooked" })}
                            className="h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white"
                          >
                            Use
                          </button>
                          <PackageMenu
                            label={`${size} package`}
                            editHref={`/package/${pkg.id}`}
                            onDuplicate={() => duplicate(pkg, product)}
                            onToss={() => setSheet({ pkg, product, reason: "expired" })}
                          />
                        </div>
                      );
                    })}
                    {packages.length > PREVIEW && !showAll[product.id] && (
                      <button
                        type="button"
                        onClick={() => setShowAll((s) => ({ ...s, [product.id]: true }))}
                        className="h-[50px] w-full rounded-b-[22px] border-t border-divider bg-surface text-[15px] font-bold text-primary"
                      >
                        Show all {packages.length} packages
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}

        <div className="flex items-start gap-2.5 rounded-[18px] bg-primary-tint px-4 py-3.5 text-[13px] leading-[1.45] text-[#0F3D22]">
          <Info size={20} strokeWidth={1.9} className="mt-px flex-none text-primary" aria-hidden />
          <span>
            <strong>Use</strong> logs what you cooked or tossed, so Insights learn. <strong>Delete</strong> (in ⋯) fixes mistakes and isn’t counted.
          </span>
        </div>
      </main>

      <Link
        href={`/add?category=${category}`}
        className="fixed right-5 z-20 flex h-[52px] items-center gap-2 rounded-[18px] bg-primary px-5 text-[15px] font-bold text-white shadow-fab"
        style={{ bottom: "calc(100px + env(safe-area-inset-bottom))" }}
      >
        <Plus size={20} strokeWidth={2.4} aria-hidden />
        Add {meta.short.toLowerCase()}
      </Link>
      <div aria-hidden className="h-20" />

      {sheet && <UseSheet pkg={sheet.pkg} product={sheet.product} initialReason={sheet.reason} onClose={() => setSheet(null)} />}
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CategoryView />
    </Suspense>
  );
}
