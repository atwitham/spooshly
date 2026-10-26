"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Clock, Plus, ShoppingCart, X } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { addToList } from "@/lib/db";
import {
  categoryStats,
  lowLabel,
  periodWindow,
  recommendations,
  runway,
  runwayHeadline,
  usageSeries,
} from "@/lib/insights";
import { CATEGORIES, type Category, categoryMeta } from "@/lib/types";
import { LB, OZ, fmtNum, formatQty } from "@/lib/units";
import { CategoryIcon, CategoryTile, Segmented, Spinner } from "@/components/ui";

const PERIODS = [
  { value: 1, label: "1 mo" },
  { value: 3, label: "3 mo" },
  { value: 6, label: "6 mo" },
  { value: 12, label: "12 mo" },
];

/** Headline + sub-line for a base amount, e.g. "1.5 lb" / "23.5 oz". */
function big(base: number, kind: "weight" | "volume" | "count", displayUnit: string) {
  if (kind === "weight" && displayUnit !== "g" && displayUnit !== "kg") {
    return { main: `${fmtNum(base / LB)} lb`, sub: `${fmtNum(base / OZ)} oz` };
  }
  const f = formatQty(base, kind, displayUnit as never);
  return { main: f, sub: "" };
}

function RunwayPanel() {
  const k = useKitchen();
  const r = useMemo(() => runway(k.ctx), [k.ctx]);
  const maxBar = Math.max(1, ...r.monthBars.map((b) => b.meals));
  const pct = (m: number) => Math.min(100, Math.max(0, (m / 8) * 100));

  return (
    <section aria-labelledby="runway-h" className="flex flex-col gap-[18px] rounded-[28px] bg-ink p-5 text-white shadow-dark">
      <div className="flex items-center justify-between">
        <h2 id="runway-h" className="m-0 text-[13px] font-bold uppercase tracking-[0.08em] text-on-dark-faint">
          Meat runway
        </h2>
        <span className="flex items-center gap-1.5 rounded-full bg-[rgba(199,240,107,.14)] px-2.5 py-[5px] text-xs font-bold text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          {r.confidence.level >= 4 ? "Seasonal" : "Learning"}
        </span>
      </div>

      {!r.hasData ? (
        <div>
          <div className="d text-[40px] font-extrabold leading-none text-accent">≈ {r.mealsOnHand} meals</div>
          <p className="mt-2.5 text-[15px] text-on-dark-muted">
            on hand. Tap <strong className="text-white">Use</strong> when you cook meat and this turns into a forecast of how long it lasts.
          </p>
        </div>
      ) : (
        <>
          <div>
            <div className="d text-[56px] font-extrabold leading-[0.95] text-accent">{runwayHeadline(r.months)}</div>
            <div className="mt-2.5 text-[15px] text-on-dark-muted">
              ≈ {r.mealsOnHand} meals on hand
              {r.lowDate && (
                <>
                  {" "}
                  · runs low around <strong className="text-white">{lowLabel(r.lowDate)}</strong>
                </>
              )}
            </div>
          </div>

          {r.band && r.months !== null && (
            <div className="flex flex-col gap-1.5">
              <div className="relative h-3.5 rounded-[7px] bg-white/10" role="img" aria-label={`Likely range ${fmtNum(Math.round(r.band.low * 2) / 2)} to ${fmtNum(Math.round(r.band.high * 2) / 2)} months`}>
                <span
                  className="absolute inset-y-0 rounded-[7px] bg-[rgba(199,240,107,.45)]"
                  style={{ left: `${pct(r.band.low)}%`, width: `${Math.max(2, pct(r.band.high) - pct(r.band.low))}%` }}
                />
                <span
                  className="absolute -top-[5px] -ml-3 h-6 w-6 rounded-full border-4 border-ink bg-accent"
                  style={{ left: `${pct(r.months)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-on-dark-faint" aria-hidden>
                <span>Now</span>
                <span>2 mo</span>
                <span>4 mo</span>
                <span>6 mo</span>
                <span>8 mo</span>
              </div>
              <div className="text-[13px] text-on-dark-muted">
                Likely range{" "}
                <strong className="text-white">
                  {fmtNum(Math.round(r.band.low * 2) / 2)}–{r.band.high > 8 ? "8+" : fmtNum(Math.round(r.band.high * 2) / 2)} months
                </strong>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-2xl bg-white/[.06] px-3.5 py-3">
            <div className="flex gap-1" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className="block h-6 w-2 rounded" style={{ background: i <= r.confidence.level ? "#C7F06B" : "rgba(255,255,255,.16)" }} />
              ))}
            </div>
            <div className="flex-1 text-[13px] leading-snug text-on-dark-muted">
              <strong className="text-white">{r.confidence.label} confidence</strong> · {r.confidence.detail}
            </div>
          </div>

          {r.monthBars.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-on-dark-faint">Meals left at month end</div>
              <div
                role="img"
                aria-label={`Projected meals left: ${r.monthBars.map((b) => `${b.label} ${b.meals}`).join(", ")}`}
                className="grid h-28 items-end gap-2.5"
                style={{ gridTemplateColumns: `repeat(${r.monthBars.length}, minmax(0, 1fr))` }}
              >
                {r.monthBars.map((b) => (
                  <div key={b.label} className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold">{b.meals}</span>
                    <div
                      className="w-full rounded-[10px]"
                      style={{
                        height: Math.max(6, (b.meals / maxBar) * 81),
                        background: b.tone === "bad" ? "#FF8A7A" : b.tone === "warn" ? "#FFB45C" : "#C7F06B",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-2.5 text-center text-xs text-on-dark-faint" style={{ gridTemplateColumns: `repeat(${r.monthBars.length}, minmax(0, 1fr))` }} aria-hidden>
                {r.monthBars.map((b) => (
                  <span key={b.label}>{b.label}</span>
                ))}
              </div>
              <div className="text-[13px] text-on-dark-muted">
                At ~{fmtNum(r.mealsPerWeek)} meals a week.
                {r.restockMonth && <span className="font-bold text-on-dark-warn"> Restock window opens in {r.restockMonth}.</span>}
              </div>
            </div>
          )}
        </>
      )}

      {r.rows.length > 0 && (
        <div className="flex flex-col border-t border-white/[.12]">
          {r.rows.map((row, i) => (
            <div key={row.product.id} className={`flex items-center gap-2.5 py-[11px] ${i < r.rows.length - 1 ? "border-b border-white/[.08]" : ""}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-bold">{row.product.name}</span>
                <span className="text-xs text-on-dark-faint">
                  {formatQty(row.portion, row.product.unit_kind, row.product.display_unit === "lb" ? "oz" : row.product.display_unit)} a meal ·{" "}
                  {row.learnedFrom > 0 ? `learned from ${row.learnedFrom}` : "estimate, none logged"}
                </span>
              </span>
              <span className="flex flex-col text-right">
                <span className={`d text-[17px] font-extrabold ${row.status.tone === "bad" ? "text-on-dark-bad" : ""}`}>{row.meals}</span>
                <span className={`text-xs ${row.status.tone === "bad" ? "text-on-dark-bad" : row.status.tone === "warn" ? "text-on-dark-warn" : "text-on-dark-faint"}`}>
                  {row.status.text}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <details className="rounded-2xl bg-white/[.06] px-3.5 py-1 text-[13px] leading-[1.45] text-on-dark-muted">
        <summary className="flex min-h-10 cursor-pointer items-center font-bold text-white">How this gets smarter</summary>
        <div className="flex flex-col gap-1.5 pb-3 pt-0.5">
          <span>• Each “Use” teaches it your real portion size per product.</span>
          <span>• Recent weeks count more, so new habits show up fast.</span>
          <span>• After a year it accounts for seasons.</span>
          <span>• Tossed or expired food is left out, so waste never looks like eating.</span>
        </div>
      </details>
    </section>
  );
}

export default function InsightsPage() {
  const k = useKitchen();
  const { householdId, user } = useAuth();
  const [months, setMonths] = useState(1);
  const [category, setCategory] = useState<Category>("meat");
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const meta = categoryMeta(category);

  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => pickerRef.current && !pickerRef.current.contains(e.target as Node) && setPicker(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picker]);

  const w = useMemo(() => periodWindow(months), [months]);
  const stats = useMemo(() => categoryStats(k.ctx, category, w), [k.ctx, category, w]);
  const series = useMemo(() => usageSeries(k.ctx, category, w), [k.ctx, category, w]);
  const recs = useMemo(
    () => recommendations(k.ctx, w, category).filter((r) => k.dismissed[r.product.id] !== r.signature),
    [k.ctx, w, category, k.dismissed]
  );
  const onList = new Set(k.list.filter((l) => !l.checked).map((l) => l.product_id));

  const unitForKind = stats.kind === "weight" ? "oz" : stats.kind === "volume" ? "ml" : "count";
  const weekly = big(stats.weekly, stats.kind, unitForKind);
  const onHand = big(stats.onHand, stats.kind, unitForKind);
  const used = big(stats.usedMonth, stats.kind, unitForKind);
  const maxBar = Math.max(1, ...series.bars.map((b) => b.value));
  const barUnit = stats.kind === "weight" ? OZ : 1;
  const barUnitLabel = stats.kind === "weight" ? "oz" : stats.kind === "volume" ? "ml" : "count";

  async function addRec(productId: string) {
    const rec = recs.find((r) => r.product.id === productId);
    if (!rec || !householdId) return;
    await addToList(householdId, { name: rec.product.name, category: rec.product.category, productId: rec.product.id, quantityText: rec.qtyLabel ?? null, source: "suggested" }, user?.id ?? null);
    await k.reload();
    k.toast(`Added ${rec.product.name} to your list`);
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <header className="flex items-center justify-between px-5 pb-1.5 pt-[18px]">
        <h1 className="d m-0 text-[30px] font-extrabold">Insights</h1>
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={picker}
            aria-label={`Category: ${meta.label}`}
            onClick={() => setPicker((p) => !p)}
            className="btn-ghost h-11 gap-2 pl-2 pr-3.5 text-sm font-bold"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px]" style={{ background: meta.tint, color: meta.ink }}>
              <CategoryIcon category={category} size={16} />
            </span>
            {meta.short}
            <ChevronDown size={16} aria-hidden />
          </button>
          {picker && (
            <div role="listbox" aria-label="Category" className="absolute right-0 top-12 z-40 flex w-[230px] flex-col rounded-[18px] bg-surface p-1.5 shadow-menu">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="option"
                  aria-selected={c.value === category}
                  onClick={() => (setCategory(c.value), setPicker(false))}
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

      <main className="flex flex-col gap-5 px-5 pt-3.5">
        <Segmented label="Time period" options={PERIODS} value={months} onChange={setMonths} />

        {!k.ready ? (
          <Spinner />
        ) : (
          <>
            {category === "meat" && <RunwayPanel />}

            <div className="grid grid-cols-2 gap-2.5">
              <div className="card !rounded-[20px] p-4">
                <div className="text-[13px] font-semibold text-muted">Avg weekly use</div>
                <div className="d mt-1 text-[28px] font-extrabold">{weekly.main}</div>
                {weekly.sub && <div className="text-xs text-muted">{weekly.sub} / week</div>}
              </div>
              <div className="card !rounded-[20px] p-4">
                <div className="text-[13px] font-semibold text-muted">On hand</div>
                <div className="d mt-1 text-[28px] font-extrabold">{onHand.main}</div>
                {onHand.sub && <div className="text-xs text-muted">{onHand.sub} {category === "meat" ? "of meat" : "in stock"}</div>}
              </div>
              <div className="card !rounded-[20px] p-4">
                <div className="text-[13px] font-semibold text-muted">Used this month</div>
                <div className="d mt-1 text-[28px] font-extrabold">{used.main}</div>
                <div className="text-xs text-muted">
                  {stats.usedMonthUses} {category === "meat" ? "meal" : "use"}
                  {stats.usedMonthUses === 1 ? "" : "s"} · {stats.usedMonthProducts} product{stats.usedMonthProducts === 1 ? "" : "s"}
                </div>
              </div>
              <div className="rounded-[20px] bg-danger-tint p-4">
                <div className="text-[13px] font-semibold text-[#7A140C]">Tossed</div>
                <div className="d mt-1 text-[28px] font-extrabold text-[#7A140C]">{formatQty(stats.tossed, stats.kind, unitForKind)}</div>
                <div className="text-xs font-bold text-danger-ink">
                  {stats.expiredInStock > 0 ? `${formatQty(stats.expiredInStock, stats.kind, unitForKind)} expired in stock` : "in this period"}
                </div>
              </div>
            </div>

            <section aria-labelledby="trend-h" className="card flex flex-col gap-3 p-[18px]">
              <div className="flex items-baseline justify-between">
                <h2 id="trend-h" className="d m-0 text-[19px] font-extrabold">
                  {series.unit === "week" ? "Weekly use" : "Monthly use"}
                </h2>
                <span className="text-xs text-muted">
                  {barUnitLabel} · last {series.bars.length} {series.unit}s
                </span>
              </div>
              {series.bars.every((b) => b.value === 0) ? (
                <p className="py-6 text-center text-sm text-muted">Nothing logged in this period yet.</p>
              ) : (
                <>
                  <div
                    role="img"
                    aria-label={`${series.unit === "week" ? "Weekly" : "Monthly"} use: ${series.bars.map((b) => `${b.label} ${fmtNum(b.value / barUnit)}`).join(", ")} ${barUnitLabel}`}
                    className="grid h-[130px] items-end px-1"
                    style={{ gridTemplateColumns: `repeat(${series.bars.length}, minmax(0, 1fr))`, gap: series.bars.length > 8 ? 4 : 16 }}
                  >
                    {series.bars.map((b, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        {series.bars.length <= 8 && <span className="text-xs font-bold">{fmtNum(Math.round(b.value / barUnit))}</span>}
                        <div
                          className="w-full rounded-xl"
                          style={{ height: Math.max(b.value > 0 ? 6 : 2, (b.value / maxBar) * 100), background: b.current ? "#15803D" : "#22C55E", borderRadius: series.bars.length > 8 ? 4 : 12 }}
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    className="grid px-1 text-center text-xs text-muted"
                    style={{ gridTemplateColumns: `repeat(${series.bars.length}, minmax(0, 1fr))`, gap: series.bars.length > 8 ? 4 : 16 }}
                    aria-hidden
                  >
                    {series.bars.map((b, i) => (
                      <span key={i} className="truncate">
                        {series.bars.length > 8 && i % 3 !== 0 && !b.current ? "" : b.label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>

            {recs.length > 0 && (
              <section aria-labelledby="rec-h" className="flex flex-col gap-2.5">
                <h2 id="rec-h" className="eyebrow">
                  Recommendations
                </h2>
                {recs.map((rec) => {
                  const tile =
                    rec.type === "buy"
                      ? { bg: "bg-danger-tint", fg: "text-danger-ink", Icon: ShoppingCart }
                      : rec.type === "use_soon"
                        ? { bg: "bg-warn-tint", fg: "text-warn-ink", Icon: Clock }
                        : { bg: "bg-info-tint", fg: "text-info-ink", Icon: AlertTriangle };
                  return (
                    <div key={`${rec.type}-${rec.product.id}`} className="card flex items-center gap-3 p-3.5">
                      <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-[14px] ${tile.bg} ${tile.fg}`}>
                        <tile.Icon size={22} strokeWidth={1.9} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold">{rec.title}</div>
                        <div className="mt-0.5 text-[13px] leading-[1.4] text-muted">{rec.reason}</div>
                      </div>
                      {rec.type === "buy" && !onList.has(rec.product.id) ? (
                        <button
                          type="button"
                          aria-label={`Add ${rec.product.name} to list`}
                          onClick={() => addRec(rec.product.id)}
                          className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-primary text-white"
                        >
                          <Plus size={22} strokeWidth={2.4} aria-hidden />
                        </button>
                      ) : rec.type === "buy" ? (
                        <span className="flex-none text-xs font-bold text-primary">On list</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Dismiss ${rec.title}`}
                          onClick={() => k.dismiss(rec.product.id, rec.signature)}
                          className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-chip text-muted"
                        >
                          <X size={18} aria-hidden />
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            <p className="m-0 text-[13px] leading-normal text-muted">
              Suggestions use your pace over the selected period, how often you shop and how much supply you like to keep (Settings). Tossed food is tracked
              separately.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
