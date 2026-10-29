/**
 * Unit tests for the Insights math and name normalization, using the
 * sanity-check data from the redesign handoff (§6.4).
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoryStats,
  periodWindow,
  recommendations,
  runway,
  runwayHeadline,
  simplePace,
  type Ctx,
} from "../src/lib/insights";
import { findExact, isSimilar, normalizedKey, pickDisplayName, suggest, duplicatePairs } from "../src/lib/normalize";
import { OZ, fmtNum, formatQty, toBase } from "../src/lib/units";
import type { Package, Product, UsageLogEntry } from "../src/lib/types";

const NOW = new Date("2026-10-25T18:00:00");
const DAY = 86400000;
const H = "h1";

function product(id: string, name: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    household_id: H,
    name,
    normalized_key: normalizedKey(name),
    aliases: [],
    category: "meat",
    unit_kind: "weight",
    display_unit: "oz",
    default_package_size: null,
    default_shelf_life_days: null,
    is_meat: true,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}
let pk = 0;
function pkg(productId: string, oz: number, expires: string | null = "2027-04-01"): Package {
  return {
    id: `p${pk++}`,
    household_id: H,
    product_id: productId,
    name: "",
    category: "meat",
    quantity: oz,
    unit: "oz",
    original_quantity: oz,
    expiration_date: expires,
    added_at: "2026-09-01",
    storage: null,
    source: null,
    barcode: null,
    photo_url: null,
    notes: null,
    added_by: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "",
  };
}
let ev = 0;
function use(productId: string, oz: number, daysAgo: number, kind: "used" | "tossed" = "used"): UsageLogEntry {
  const at = new Date(NOW.getTime() - daysAgo * DAY).toISOString();
  return {
    id: `e${ev++}`,
    household_id: H,
    product_id: productId,
    package_id: null,
    item_name: "",
    category: "meat",
    quantity_removed: oz,
    unit: "oz",
    reason: kind === "used" ? "used" : "expired",
    kind,
    toss_reason: null,
    occurred_at: at,
    removed_by: null,
    created_at: at,
  };
}

const settings = { shop_every_days: 7, target_supply_weeks: 4, low_stock_warn_weeks: 2, expiry_reminder_days: 3 } as const;

// Alec's real month: chicken 76 oz over 8 uses, shrimp 12 oz, turkey 16 oz.
function sampleCtx(): Ctx {
  const chicken = product("chicken", "Boneless Chicken Breast");
  const shrimp = product("shrimp", "Raw Shrimp");
  const andouille = product("andouille", "Andouille Smoked Sausage");
  const turkey = product("turkey", "Ground Turkey");
  const packages: Package[] = [];
  for (let i = 0; i < 40; i++) packages.push(pkg("chicken", 11));
  packages.push(pkg("chicken", 11), pkg("chicken", 7, "2026-08-15")); // 40*11 + 11 + 7 = 458
  packages.push(pkg("shrimp", 32, "2026-10-28"), pkg("andouille", 13));
  const events: UsageLogEntry[] = [
    ...[29, 26, 22, 18, 15, 11, 7, 3].map((d) => use("chicken", 9.5, d)),
    use("shrimp", 12, 20),
    use("turkey", 16, 12),
    // older history (the real household has used the app since August)
    { ...use("paprika", 1, 80), unit: "count", category: "seasoning" },
  ];
  const paprika = product("paprika", "Smoked Paprika", { category: "seasoning", unit_kind: "count", display_unit: "count", is_meat: false });
  return { products: [chicken, shrimp, andouille, turkey, paprika], packages, events, settings, now: NOW };
}

test("unit bug fixed: 23.5 oz/week = 1.5 lb, not 23.5 lb", () => {
  const ctx = sampleCtx();
  const w = periodWindow(1, NOW);
  const chicken = simplePace(ctx.products[0], ctx, w);
  assert.equal(fmtNum(chicken.pace / OZ), "17.2");
  const stats = categoryStats(ctx, "meat", w);
  assert.equal(fmtNum(stats.weekly / OZ), "23.5");
  assert.equal(fmtNum(stats.weekly / toBase(1, "lb")), "1.5");
  assert.equal(formatQty(stats.onHand, "weight", "oz", { withLb: true }), "503 oz (31.4 lb)");
});

test("meat runway sanity check ≈ 53 meals, ~5 months", () => {
  const r = runway(sampleCtx());
  const meals = Object.fromEntries(r.rows.map((x) => [x.product.id, x.meals]));
  assert.equal(meals.chicken, 48);
  assert.equal(meals.shrimp, 3);
  assert.equal(meals.andouille, 2);
  assert.equal(meals.turkey, 0);
  assert.equal(r.mealsOnHand, 53);
  assert.ok(r.mealsPerWeek > 2.0 && r.mealsPerWeek < 2.6, `meals/week ${r.mealsPerWeek}`);
  assert.equal(runwayHeadline(r.months), "~5 months");
  assert.equal(r.confidence.label, "Low");
  assert.ok(r.band && r.band.low < r.months! && r.band.high > r.months!);
  assert.equal(r.rows.find((x) => x.product.id === "andouille")!.learnedFrom, 0);
  assert.equal(r.rows.find((x) => x.product.id === "shrimp")!.status.text, "use by Oct 28");
  assert.equal(r.rows.find((x) => x.product.id === "turkey")!.status.text, "out");
});

test("recommendations: buy turkey, cook shrimp, skip chicken", () => {
  const recs = recommendations(sampleCtx());
  const turkey = recs.find((r) => r.product.id === "turkey")!;
  assert.equal(turkey.type, "buy");
  assert.equal(turkey.qtyLabel, "1 lb");
  assert.equal(turkey.shortLead, "Out");
  assert.equal(turkey.short, "~3.6 oz a week");
  assert.equal(recs.find((r) => r.product.id === "shrimp")?.type, "use_soon");
  const chicken = recs.find((r) => r.product.id === "chicken")!;
  assert.equal(chicken.type, "overstock");
  assert.match(chicken.reason, /1 is past its date/);
});

test("settings change the results", () => {
  const ctx = sampleCtx();
  ctx.packages.push({ ...pkg("turkey", 12), id: "t1" }); // 12 oz at 3.6 oz/wk ≈ 3.3 wks
  assert.equal(recommendations(ctx).find((r) => r.product.id === "turkey" && r.type === "buy"), undefined);
  ctx.settings = { ...settings, shop_every_days: 30, low_stock_warn_weeks: 2 };
  assert.equal(recommendations(ctx).find((r) => r.product.id === "turkey")?.type, "buy");
});

test("tossed food never counts as usage", () => {
  const ctx = sampleCtx();
  ctx.events.push(use("chicken", 100, 2, "tossed"));
  assert.equal(fmtNum(simplePace(ctx.products[0], ctx, periodWindow(1, NOW)).pace / OZ), "17.2");
  assert.equal(runway(ctx).mealsOnHand, 53);
  assert.equal(fmtNum(categoryStats(ctx, "meat", periodWindow(1, NOW)).tossed / OZ), "100");
});

test("band narrows and confidence rises with more history", () => {
  const results = [1, 3, 6, 12].map((months) => {
    const chicken = product("chicken", "Chicken");
    const packages = Array.from({ length: 40 }, () => pkg("chicken", 10));
    const events: UsageLogEntry[] = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const span = Math.round(months * 30.44) + 1;
    events.push(use("chicken", 10, span));
    for (let d = span - 1; d > 0; d--) if (rand() < 2.3 / 7) events.push(use("chicken", 10, d));
    const r = runway({ products: [chicken], packages, events, settings, now: NOW });
    return { months, width: r.band!.high - r.band!.low, level: r.confidence.level };
  });
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i].width < results[i - 1].width, `band ${JSON.stringify(results)}`);
    assert.ok(results[i].level > results[i - 1].level, `confidence ${JSON.stringify(results)}`);
  }
});

test("normalization: variants collapse, similar detection", () => {
  assert.equal(normalizedKey("Boneless Chicken Breasts"), normalizedKey("Boneless Chicken Breast"));
  assert.equal(normalizedKey("Tomatoes"), "tomato");
  assert.equal(normalizedKey("Berries"), "berry");
  assert.equal(normalizedKey("Glass"), "glass");
  const products = sampleCtx().products;
  assert.equal(findExact("boneless chicken breasts", products)?.name, "Boneless Chicken Breast");
  assert.equal(findExact("shrimp", products), undefined);
  assert.ok(isSimilar("Shrimp", "Raw Shrimp"));
  assert.ok(!isSimilar("Ground Turkey", "Raw Shrimp"));
  const s = suggest("shrimp", products, () => ({ inStock: 0, lastUsed: 0 }));
  assert.equal(s[0]?.name, "Raw Shrimp");
  assert.equal(suggest("chick", products, () => ({ inStock: 0, lastUsed: 0 }))[0]?.name, "Boneless Chicken Breast");
  assert.equal(pickDisplayName(["Boneless Chicken Breasts", "Boneless Chicken Breasts", "Boneless Chicken Breast"]), "Boneless Chicken Breast");
  const withShrimp = [...products, product("s2", "Shrimp")];
  assert.equal(duplicatePairs(withShrimp).length, 1);
});

test("freezer space caps meat buy suggestions", () => {
  const ctx = sampleCtx();
  const used = ctx.packages.filter((p) => p.category === "meat").reduce((s, p) => s + toBase(p.quantity, p.unit), 0);
  ctx.settings = { ...settings, freezer_capacity_g: used }; // packed full
  assert.equal(recommendations(ctx).find((r) => r.product.id === "turkey" && r.type === "buy"), undefined);
  ctx.settings = { ...settings, freezer_capacity_g: used + toBase(2, "lb") }; // 2 lb of room
  assert.equal(recommendations(ctx).find((r) => r.product.id === "turkey")?.qtyLabel, "1 lb");
});
