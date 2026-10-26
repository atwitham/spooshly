/**
 * Pure calculation layer for Insights, restock suggestions and the meat
 * runway (handoff §6.2–§6.4). No Supabase calls in here, so it can be unit
 * tested with plain data (see scripts/test-insights.ts).
 */
import { addWeeks, endOfDay, endOfMonth, format, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import {
  type Category,
  type HouseholdSettings,
  type Package,
  type Product,
  type UsageLogEntry,
  categoryMeta,
  eventKind,
  eventTime,
} from "./types";
import { LB, OZ, fmtNum, formatQty, toBase, unitKind } from "./units";
import { daysUntil, fmtDay, fuzzyMonth, parseDay } from "./dates";

const DAY = 86400000;
const WEEK = 7 * DAY;
export const WEEKS_PER_MONTH = 4.345;
const HALF_LIFE_WEEKS = 4;
const DEFAULT_MEAT_PORTION = 8 * OZ;

export interface Ctx {
  products: Product[];
  packages: Package[];
  events: UsageLogEntry[];
  settings: Pick<HouseholdSettings, "shop_every_days" | "target_supply_weeks" | "low_stock_warn_weeks" | "expiry_reminder_days">;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------
export const eventBase = (e: UsageLogEntry) => toBase(e.quantity_removed, e.unit);
export const packageBase = (p: Package) => toBase(p.quantity, p.unit);
const t = (e: UsageLogEntry) => new Date(eventTime(e)).getTime();

export function packagesOf(productId: string, packages: Package[]) {
  return packages.filter((p) => p.product_id === productId);
}

export function onHandBase(product: Product, packages: Package[]) {
  return packagesOf(product.id, packages)
    .filter((p) => unitKind(p.unit) === product.unit_kind)
    .reduce((s, p) => s + packageBase(p), 0);
}

export function usedEventsOf(product: Product, events: UsageLogEntry[]) {
  return events.filter(
    (e) => e.product_id === product.id && eventKind(e) === "used" && unitKind(e.unit) === product.unit_kind
  );
}

export interface Window {
  months: number;
  start: Date;
  end: Date;
  weeks: number;
}

/** Same window the old Usage screen used: start of day N months ago → end of today. */
export function periodWindow(months: number, now = new Date()): Window {
  const start = startOfDay(subMonths(now, months));
  const end = endOfDay(now);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY));
  return { months, start, end, weeks: days / 7 };
}

/** Weeks to divide by: the window, or time since the first logged use (min 1 week) for new households. */
export function effectiveWeeks(w: Window, events: UsageLogEntry[]) {
  const used = events.filter((e) => eventKind(e) === "used");
  if (used.length === 0) return w.weeks;
  const first = Math.min(...used.map(t));
  if (first <= w.start.getTime()) return w.weeks;
  return Math.max(1, (w.end.getTime() - first) / WEEK);
}

/** Simple average weekly pace (base units / week) over a window. */
export function simplePace(product: Product, ctx: Ctx, w: Window) {
  const inWin = usedEventsOf(product, ctx.events).filter(
    (e) => t(e) >= w.start.getTime() && t(e) <= w.end.getTime()
  );
  const total = inWin.reduce((s, e) => s + eventBase(e), 0);
  return { pace: total / effectiveWeeks(w, ctx.events), total, uses: inWin.length };
}

// ---------------------------------------------------------------------------
// Recency weighting (half-life ~4 weeks)
// ---------------------------------------------------------------------------
const weight = (ageWeeks: number) => Math.pow(0.5, Math.max(0, ageWeeks) / HALF_LIFE_WEEKS);
const weightIntegral = (T: number) => (HALF_LIFE_WEEKS / Math.LN2) * (1 - Math.pow(0.5, T / HALF_LIFE_WEEKS));

/**
 * Recency-weighted rate per week. Unbiased: a steady rate r gives back r.
 * `historyStart` is when observation began (first event in the household).
 */
export function weightedRate(items: { at: number; amount: number }[], now: number, historyStart: number) {
  if (items.length === 0) return 0;
  const T = Math.max(1, (now - historyStart) / WEEK);
  const sum = items.reduce((s, i) => s + weight((now - i.at) / WEEK) * i.amount, 0);
  return sum / weightIntegral(T);
}

/** Recency-weighted average portion per use (base units), or null if never used. */
export function learnedPortion(used: UsageLogEntry[], now: number) {
  if (used.length === 0) return null;
  let ws = 0;
  let s = 0;
  for (const e of used) {
    const w = weight((now - t(e)) / WEEK);
    ws += w;
    s += w * eventBase(e);
  }
  return s / ws;
}

// ---------------------------------------------------------------------------
// Category stats (Insights stat grid + weekly chart)
// ---------------------------------------------------------------------------
export function categoryStats(ctx: Ctx, category: Category, w: Window) {
  const now = ctx.now ?? new Date();
  const products = ctx.products.filter((p) => p.category === category);
  const kindCounts = { weight: 0, volume: 0, count: 0 };
  products.forEach((p) => kindCounts[p.unit_kind]++);
  const kind = (Object.entries(kindCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "weight") as Product["unit_kind"];
  const sameKind = products.filter((p) => p.unit_kind === kind);

  const weekly = sameKind.reduce((s, p) => s + simplePace(p, ctx, w).pace, 0);
  const onHand = sameKind.reduce((s, p) => s + onHandBase(p, ctx.packages), 0);

  const monthStart = startOfMonth(now).getTime();
  const thisMonth = ctx.events.filter(
    (e) =>
      eventKind(e) === "used" &&
      t(e) >= monthStart &&
      sameKind.some((p) => p.id === e.product_id) &&
      unitKind(e.unit) === kind
  );
  const usedMonth = thisMonth.reduce((s, e) => s + eventBase(e), 0);

  const tossed = ctx.events
    .filter(
      (e) =>
        eventKind(e) === "tossed" &&
        t(e) >= w.start.getTime() &&
        products.some((p) => p.id === e.product_id) &&
        unitKind(e.unit) === kind
    )
    .reduce((s, e) => s + eventBase(e), 0);

  const expiredInStock = ctx.packages
    .filter(
      (p) =>
        sameKind.some((x) => x.id === p.product_id) &&
        p.expiration_date &&
        (daysUntil(p.expiration_date, now) ?? 0) < 0 &&
        unitKind(p.unit) === kind
    )
    .reduce((s, p) => s + packageBase(p), 0);

  return {
    kind,
    weekly,
    onHand,
    usedMonth,
    usedMonthUses: thisMonth.length,
    usedMonthProducts: new Set(thisMonth.map((e) => e.product_id)).size,
    tossed,
    expiredInStock,
  };
}

export interface Bar {
  label: string;
  value: number;
  current: boolean;
}

/** Weekly bars for ≤3 months, monthly bars for longer periods. */
export function usageSeries(ctx: Ctx, category: Category, w: Window): { bars: Bar[]; unit: "week" | "month" } {
  const now = ctx.now ?? new Date();
  const ids = new Set(ctx.products.filter((p) => p.category === category).map((p) => p.id));
  const used = ctx.events.filter((e) => eventKind(e) === "used" && e.product_id && ids.has(e.product_id));
  const bars: Bar[] = [];
  if (w.months <= 3) {
    let s = startOfWeek(w.start, { weekStartsOn: 0 });
    const weeksCount = Math.ceil((now.getTime() - s.getTime()) / WEEK);
    const thisWeek = startOfWeek(now, { weekStartsOn: 0 }).getTime();
    while (s.getTime() <= now.getTime()) {
      const e = addWeeks(s, 1).getTime();
      const v = used.filter((x) => t(x) >= s.getTime() && t(x) < e).reduce((a, x) => a + eventBase(x), 0);
      const current = s.getTime() === thisWeek;
      bars.push({ label: current ? "This wk" : format(s, weeksCount > 4 ? "M/d" : "MMM d"), value: v, current });
      s = addWeeks(s, 1);
    }
    return { bars, unit: "week" };
  }
  let m = startOfMonth(w.start);
  while (m.getTime() <= now.getTime()) {
    const e = endOfMonth(m).getTime();
    const v = used.filter((x) => t(x) >= m.getTime() && t(x) <= e).reduce((a, x) => a + eventBase(x), 0);
    const current = m.getTime() === startOfMonth(now).getTime();
    bars.push({ label: format(m, "MMM"), value: v, current });
    m = startOfMonth(new Date(e + DAY));
  }
  return { bars, unit: "month" };
}

// ---------------------------------------------------------------------------
// Restock recommendations (§6.3)
// ---------------------------------------------------------------------------
export interface Recommendation {
  type: "buy" | "use_soon" | "overstock";
  product: Product;
  title: string;
  reason: string;
  /** Short reason for Home / List ("Out · ~3.6 oz a week"). */
  short: string;
  /** Emphasised prefix of `short` ("Out", "~2 wks left"). */
  shortLead?: string;
  qtyLabel?: string;
  qtyBase?: number;
  signature: string;
}

function packageSizeBase(product: Product, packages: Package[]) {
  if (product.default_package_size && product.default_package_size > 0) return product.default_package_size;
  if (product.unit_kind === "weight") return LB;
  if (product.unit_kind === "volume") {
    const last = packagesOf(product.id, packages).at(-1);
    return last ? toBase(last.original_quantity ?? last.quantity, last.unit) : 500;
  }
  return 1;
}

export function qtyLabel(product: Product, base: number) {
  if (product.unit_kind === "count") {
    const noun = categoryMeta(product.category).countNoun;
    const n = Math.round(base);
    return `${n} ${noun}${n === 1 ? "" : "s"}`;
  }
  if (product.unit_kind === "weight" && product.display_unit !== "g" && product.display_unit !== "kg") {
    const lb = base / LB;
    if (Math.abs(lb - Math.round(lb)) < 0.01 && lb >= 1) return `${Math.round(lb)} lb`;
  }
  return formatQty(base, product.unit_kind, product.display_unit);
}

export const paceLabel = (product: Product, pace: number) =>
  `${formatQty(pace, product.unit_kind, product.display_unit === "lb" ? "oz" : product.display_unit)} a week`;

export function recommendations(ctx: Ctx, w = periodWindow(1, ctx.now), category?: Category): Recommendation[] {
  const now = ctx.now ?? new Date();
  const s = ctx.settings;
  const out: Recommendation[] = [];
  const products = category ? ctx.products.filter((p) => p.category === category) : ctx.products;

  for (const p of products) {
    const { pace } = simplePace(p, ctx, w);
    const onHand = onHandBase(p, ctx.packages);
    const pkgs = packagesOf(p.id, ctx.packages);
    const sig = `${Math.round(onHand)}:${Math.round(pace)}:${pkgs.length}`;

    // Use soon: something expires within the reminder window and we won't
    // get through it at normal pace.
    const reminder = s.expiry_reminder_days;
    const soon = pkgs
      .filter((x) => {
        const d = daysUntil(x.expiration_date, now);
        return d !== null && d >= 0 && d <= reminder;
      })
      .sort((a, b) => (a.expiration_date! < b.expiration_date! ? -1 : 1));
    if (soon.length > 0) {
      const soonBase = soon.reduce((a, x) => a + packageBase(x), 0);
      const daysToUse = pace > 0 ? (soonBase / pace) * 7 : Infinity;
      if (daysToUse > reminder) {
        const portion = learnedPortion(usedEventsOf(p, ctx.events), now.getTime()) ?? (p.is_meat ? DEFAULT_MEAT_PORTION : null);
        const meals = portion ? soonBase / portion : 0;
        const mealsText =
          p.is_meat && meals > 0
            ? ` Plan ${Math.floor(meals) === Math.ceil(meals) ? Math.round(meals) : `${Math.max(1, Math.floor(meals))}–${Math.ceil(meals)}`} ${p.name.split(" ").pop()?.toLowerCase()} meal${meals > 1 ? "s" : ""} now.`
            : "";
        out.push({
          type: "use_soon",
          product: p,
          title: p.is_meat ? `Cook ${p.name} this week` : `Use ${p.name} soon`,
          reason: `${formatQty(soonBase, p.unit_kind, p.display_unit)} expires ${fmtDay(soon[0].expiration_date)}.${mealsText}`,
          short: `Expires ${fmtDay(soon[0].expiration_date)}`,
          signature: sig,
        });
      }
    }

    if (pace <= 0) continue; // needs at least one use in the period

    const weeksLeft = onHand / pace;
    const lead = s.shop_every_days / 7;
    const needs = onHand <= 0 || weeksLeft <= Math.max(s.low_stock_warn_weeks, lead);
    if (needs) {
      const size = packageSizeBase(p, ctx.packages);
      const want = Math.max(0, s.target_supply_weeks * pace - onHand);
      const qty = Math.max(size, Math.ceil(want / size - 1e-9) * size);
      const label = qtyLabel(p, qty);
      const outBy = new Date(now.getTime() + weeksLeft * WEEK);
      out.push({
        type: "buy",
        product: p,
        title: `Buy ${p.name} · ${label}`,
        reason:
          onHand <= 0
            ? `Out. At ~${paceLabel(p, pace)}, ${label} covers your ${s.target_supply_weeks}-week target.`
            : `~${fmtNum(weeksLeft)} weeks left at your pace. ${label} brings you to ${s.target_supply_weeks} weeks.`,
        shortLead: onHand <= 0 ? "Out" : `~${Math.max(1, Math.round(weeksLeft))} wk${Math.round(weeksLeft) === 1 ? "" : "s"} left`,
        short: onHand <= 0 ? `~${paceLabel(p, pace)}` : `out by ${fmtDay(outBy)}`,
        qtyLabel: label,
        qtyBase: qty,
        signature: sig,
      });
    } else if (weeksLeft > 3 * s.target_supply_weeks) {
      const expired = pkgs.filter((x) => (daysUntil(x.expiration_date, now) ?? 1) < 0).length;
      const until = new Date(now.getTime() + (weeksLeft - s.target_supply_weeks) * WEEK);
      out.push({
        type: "overstock",
        product: p,
        title: `Skip ${p.name} until ~${format(until, "MMMM")}`,
        reason: `${formatQty(onHand, p.unit_kind, p.unit_kind === "weight" ? "lb" : p.display_unit)} on hand ≈ ${Math.round(weeksLeft)} weeks. Use oldest first${
          expired ? `; ${expired} ${expired === 1 ? "is" : "are"} past ${expired === 1 ? "its" : "their"} date` : ""
        }.`,
        short: `~${Math.round(weeksLeft)} wks on hand`,
        signature: sig,
      });
    }
  }
  const order = { buy: 0, use_soon: 1, overstock: 2 };
  return out.sort((a, b) => order[a.type] - order[b.type]);
}

/** Weeks of supply for a product (for the "~26 wks" pill). null = no pace yet. */
export function weeksOnHand(product: Product, ctx: Ctx, w = periodWindow(1, ctx.now)) {
  const { pace } = simplePace(product, ctx, w);
  if (pace <= 0) return null;
  return onHandBase(product, ctx.packages) / pace;
}

// ---------------------------------------------------------------------------
// Meat runway (§6.4)
// ---------------------------------------------------------------------------
export interface RunwayProductRow {
  product: Product;
  portion: number;
  learnedFrom: number;
  meals: number;
  onHand: number;
  status: { text: string; tone: "normal" | "warn" | "bad" };
}

export interface Runway {
  hasData: boolean;
  mealsOnHand: number;
  mealsPerWeek: number;
  months: number | null;
  lowDate: Date | null;
  outDate: Date | null;
  band: { low: number; high: number } | null;
  confidence: { level: 1 | 2 | 3 | 4; label: "Low" | "Fair" | "Good" | "High"; detail: string };
  monthBars: { label: string; meals: number; tone: "normal" | "warn" | "bad" }[];
  restockMonth: string | null;
  seasonal: boolean;
  rows: RunwayProductRow[];
  totalEvents: number;
}

export function runway(ctx: Ctx): Runway {
  const now = ctx.now ?? new Date();
  const nowMs = now.getTime();
  const meat = ctx.products.filter((p) => p.is_meat);
  const meatIds = new Set(meat.map((p) => p.id));
  const meatUsed = ctx.events.filter((e) => e.product_id && meatIds.has(e.product_id) && eventKind(e) === "used");
  const historyStart = meatUsed.length ? Math.min(...meatUsed.map(t)) : nowMs;
  const historyDays = (nowMs - historyStart) / DAY;

  // Per-product portion + meals
  const rows: RunwayProductRow[] = meat
    .map((p) => {
      const used = usedEventsOf(p, ctx.events);
      const portion =
        learnedPortion(used, nowMs) ?? (p.unit_kind === "weight" ? DEFAULT_MEAT_PORTION : p.unit_kind === "volume" ? 250 : 1);
      const onHand = onHandBase(p, ctx.packages);
      const meals = onHand > 0 ? Math.round(onHand / portion) : 0;
      const rate = weightedRate(used.map((e) => ({ at: t(e), amount: 1 })), nowMs, historyStart);
      let status: RunwayProductRow["status"];
      if (onHand <= 0) status = { text: "out", tone: "bad" };
      else {
        const upcoming = packagesOf(p.id, ctx.packages)
          .map((x) => x.expiration_date)
          .filter((d): d is string => !!d && (daysUntil(d, now) ?? -1) >= 0)
          .sort()[0];
        const weeksToEat = rate > 0 ? meals / rate : Infinity;
        const finish = nowMs + weeksToEat * WEEK;
        if (upcoming && (daysUntil(upcoming, now) ?? 99) <= 30 && parseDay(upcoming).getTime() < finish) {
          status = { text: `use by ${fmtDay(upcoming)}`, tone: "warn" };
        } else if (rate > 0) {
          status = { text: `~${fmtNum(Math.round((weeksToEat / WEEKS_PER_MONTH) * 2) / 2)} mo`, tone: "normal" };
        } else status = { text: "—", tone: "normal" };
      }
      return { product: p, portion, learnedFrom: used.length, meals, onHand, status };
    })
    .filter((r) => r.onHand > 0 || r.learnedFrom > 0)
    .sort((a, b) => b.meals - a.meals || b.learnedFrom - a.learnedFrom);

  const mealsOnHand = rows.reduce((s, r) => s + r.meals, 0);
  const mealsPerWeek = weightedRate(meatUsed.map((e) => ({ at: t(e), amount: 1 })), nowMs, historyStart);

  // Confidence
  const histMonths = historyDays / 30.44;
  const n = meatUsed.length;
  let level: 1 | 2 | 3 | 4 = histMonths < 2 || n < 12 ? 1 : histMonths < 6 ? 2 : histMonths < 12 ? 3 : 4;
  const labels = { 1: "Low", 2: "Fair", 3: "Good", 4: "High" } as const;
  const wholeMonths = Math.max(1, Math.round(histMonths));
  const monthsText = `${wholeMonths} month${wholeMonths === 1 ? "" : "s"} of history`;
  const detail =
    level === 1
      ? `${monthsText}, ${n} meal${n === 1 ? "" : "s"} logged. Narrows as you log.`
      : level === 2
        ? `${monthsText}. Portions and pace are settling in.`
        : level === 3
          ? `${monthsText}. Recent weeks weigh most.`
          : `${monthsText}, seasons included.`;
  const confidence = { level, label: labels[level], detail };

  const empty: Runway = {
    hasData: false,
    mealsOnHand,
    mealsPerWeek,
    months: null,
    lowDate: null,
    outDate: null,
    band: null,
    confidence,
    monthBars: [],
    restockMonth: null,
    seasonal: false,
    rows,
    totalEvents: n,
  };
  if (mealsPerWeek <= 0 || meatUsed.length === 0) return empty;

  // Seasonality (≥ 12 months of history)
  const seasonal = historyDays >= 365;
  const factor = new Array(12).fill(1);
  if (seasonal) {
    const yearAgo = nowMs - 365 * DAY;
    const counts = new Array(12).fill(0);
    meatUsed.filter((e) => t(e) >= yearAgo).forEach((e) => counts[new Date(t(e)).getMonth()]++);
    const mean = counts.reduce((a, b) => a + b, 0) / 12;
    if (mean > 0) counts.forEach((c, i) => (factor[i] = Math.max(0.25, c / mean)));
  }

  // Simulate week by week
  const warnMeals = ctx.settings.low_stock_warn_weeks * mealsPerWeek;
  let left = mealsOnHand;
  let week = 0;
  let lowDate: Date | null = left < warnMeals ? now : null;
  let outWeeks: number | null = left <= 0 ? 0 : null;
  const leftAt = (date: Date) => {
    let l = mealsOnHand;
    let cursor = nowMs;
    while (cursor + WEEK <= date.getTime() && l > 0) {
      l -= mealsPerWeek * factor[new Date(cursor).getMonth()];
      cursor += WEEK;
    }
    const frac = (date.getTime() - cursor) / WEEK;
    if (l > 0 && frac > 0) l -= mealsPerWeek * factor[new Date(cursor).getMonth()] * frac;
    return Math.max(0, l);
  };
  while (left > 0 && week < 520) {
    const f = factor[new Date(nowMs + week * WEEK).getMonth()];
    const next = left - mealsPerWeek * f;
    if (!lowDate && next < warnMeals) {
      lowDate = new Date(nowMs + (week + (left - warnMeals) / (mealsPerWeek * f)) * WEEK);
    }
    if (next <= 0) {
      outWeeks = week + left / (mealsPerWeek * f);
      break;
    }
    left = next;
    week++;
  }
  outWeeks ??= week;
  const months = outWeeks / WEEKS_PER_MONTH;
  const outDate = new Date(nowMs + outWeeks * WEEK);

  // Uncertainty band from weekly meal counts (≈80%: ±1.28 standard errors)
  const weeks = Math.min(52, Math.floor((nowMs - historyStart) / WEEK));
  const weekly: number[] = [];
  for (let i = 0; i < weeks; i++) {
    const e = nowMs - i * WEEK;
    const s = e - WEEK;
    weekly.push(meatUsed.filter((x) => t(x) > s && t(x) <= e).length);
  }
  let se: number;
  if (weekly.length >= 2) {
    const mean = weekly.reduce((a, b) => a + b, 0) / weekly.length;
    const sd = Math.sqrt(weekly.reduce((a, b) => a + (b - mean) ** 2, 0) / (weekly.length - 1));
    se = Math.max(sd / Math.sqrt(weekly.length), mealsPerWeek * 0.03);
  } else se = mealsPerWeek * 0.5;
  const hiRate = mealsPerWeek + 1.28 * se;
  const loRate = Math.max(mealsPerWeek * 0.2, mealsPerWeek - 1.28 * se);
  const band = {
    low: mealsOnHand / hiRate / WEEKS_PER_MONTH,
    high: mealsOnHand / loRate / WEEKS_PER_MONTH,
  };

  // Month-end projection bars until zero (max 8)
  const monthBars: Runway["monthBars"] = [];
  let m = endOfMonth(now);
  const lowKey = lowDate ? format(lowDate, "yyyy-MM") : null;
  const outKey = format(outDate, "yyyy-MM");
  for (let i = 0; i < 8; i++) {
    const meals = Math.round(leftAt(m));
    const key = format(m, "yyyy-MM");
    const tone = key === outKey || meals === 0 ? "bad" : key === lowKey ? "warn" : "normal";
    monthBars.push({ label: format(m, "MMM"), meals, tone });
    if (meals <= 0) break;
    m = endOfMonth(new Date(m.getTime() + DAY));
  }

  return {
    hasData: true,
    mealsOnHand,
    mealsPerWeek,
    months,
    lowDate,
    outDate,
    band,
    confidence,
    monthBars,
    restockMonth: lowDate ? format(lowDate, "MMMM") : null,
    seasonal,
    rows,
    totalEvents: n,
  };
}

export const runwayHeadline = (months: number | null) => {
  if (months === null) return "—";
  if (months < 1) return `~${Math.max(1, Math.round(months * WEEKS_PER_MONTH))} weeks`;
  const r = Math.round(months);
  return `~${r} month${r === 1 ? "" : "s"}`;
};
export const runwayShort = (months: number | null) => {
  if (months === null) return "—";
  if (months < 1) return `~${Math.max(1, Math.round(months * WEEKS_PER_MONTH))} wk`;
  return `~${Math.round(months)} mo`;
};
export const lowLabel = (d: Date | null) => (d ? fuzzyMonth(d) : null);
