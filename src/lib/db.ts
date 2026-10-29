/**
 * All Supabase reads and writes for the redesigned app.
 *
 * Data-safety rules this file follows:
 *  - Existing rows are never rewritten except for the NEW columns added by
 *    supabase/migrations/2026-10-25_redesign.sql (product_id, etc.) or when
 *    the user explicitly edits/uses/deletes something.
 *  - Delete never writes a usage event; Use/Toss always do.
 *  - Every logging action returns an undo function.
 */
import { endOfDay } from "date-fns";
import { supabase } from "./supabaseClient";
import {
  type ActivityEntry,
  type Category,
  type HouseholdSettings,
  type InventoryItem,
  type Product,
  type ShoppingListItem,
  type Unit,
  type UsageLogEntry,
  DEFAULT_SETTINGS,
  eventTime,
} from "./types";
import { findExact, normalizedKey, pickDisplayName } from "./normalize";
import { toBase, unitKind } from "./units";
import { parseDay, todayISO } from "./dates";

const PAGE = 1000;

/** Supabase caps a select at 1000 rows; page through everything. */
async function fetchAll<T>(table: string, householdId: string, order = "created_at"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("household_id", householdId)
      .order(order, { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function chunk<T>(arr: T[], n = 200) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const num = (v: unknown) => (v === null || v === undefined ? v : Number(v));
const normItem = (r: InventoryItem): InventoryItem => ({
  ...r,
  quantity: Number(r.quantity),
  original_quantity: num(r.original_quantity) as number | null,
});
const normEvent = (r: UsageLogEntry): UsageLogEntry => ({ ...r, quantity_removed: Number(r.quantity_removed) });
const normProduct = (r: Product): Product => ({
  ...r,
  aliases: r.aliases ?? [],
  default_package_size: num(r.default_package_size) as number | null,
});

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
export interface KitchenData {
  products: Product[];
  packages: InventoryItem[];
  events: UsageLogEntry[];
  list: ShoppingListItem[];
  settings: HouseholdSettings;
}

/** True when the redesign migration hasn't been run on this database yet. */
export async function schemaMissing() {
  const { error } = await supabase.from("products").select("id").limit(1);
  if (!error) return false;
  return /does not exist|schema cache|42P01|PGRST205/i.test(`${error.code} ${error.message}`);
}

export async function loadKitchen(householdId: string): Promise<KitchenData> {
  const [products, packages, events, list, settingsRes] = await Promise.all([
    fetchAll<Product>("products", householdId),
    fetchAll<InventoryItem>("inventory_items", householdId),
    fetchAll<UsageLogEntry>("usage_log", householdId),
    fetchAll<ShoppingListItem>("shopping_list", householdId),
    supabase.from("household_settings").select("*").eq("household_id", householdId).maybeSingle(),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  return {
    products: products.map(normProduct),
    packages: packages.map(normItem),
    events: events.map(normEvent).sort((a, b) => (eventTime(a) < eventTime(b) ? -1 : 1)),
    list,
    settings: (settingsRes.data as HouseholdSettings | null) ?? { household_id: householdId, ...DEFAULT_SETTINGS },
  };
}

// ---------------------------------------------------------------------------
// One-time linking of pre-redesign rows to canonical products.
// Only fills the new product_id columns and creates rows in the new
// products table. Never renames, merges or removes existing items.
// ---------------------------------------------------------------------------
function mostCommon<T>(values: T[]): T {
  const m = new Map<T, number>();
  values.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0][0];
}

export async function linkUnlinkedRows(householdId: string, data: KitchenData): Promise<boolean> {
  const items = data.packages.filter((p) => !p.product_id);
  const events = data.events.filter((e) => !e.product_id);
  const listRows = data.list.filter((l) => !l.product_id);
  if (items.length === 0 && events.length === 0 && listRows.length === 0) return false;

  type Group = { names: string[]; categories: Category[]; units: Unit[]; itemIds: string[]; eventIds: string[] };
  const groups = new Map<string, Group>();
  const products = [...data.products];

  const groupFor = (name: string) => {
    const existing = findExact(name, products);
    const key = existing ? existing.normalized_key : normalizedKey(name) || name.trim().toLowerCase() || "unnamed item";
    if (!groups.has(key)) groups.set(key, { names: [], categories: [], units: [], itemIds: [], eventIds: [] });
    return groups.get(key)!;
  };
  for (const it of items) {
    const g = groupFor(it.name);
    g.names.push(it.name);
    g.categories.push(it.category);
    g.units.push(it.unit);
    g.itemIds.push(it.id);
  }
  for (const e of events) {
    const g = groupFor(e.item_name);
    g.names.push(e.item_name);
    g.categories.push(e.category);
    g.units.push(e.unit);
    g.eventIds.push(e.id);
  }

  // Create missing products (unique key per household is enforced in the DB,
  // so two phones doing this at once can't create duplicates).
  const toCreate = Array.from(groups.entries())
    .filter(([key]) => !products.some((p) => p.normalized_key === key))
    .map(([key, g]) => {
      const name = pickDisplayName(g.names);
      const category = mostCommon(g.categories);
      const unit = mostCommon(g.units.filter((u) => unitKind(u) === unitKind(mostCommon(g.units))));
      return {
        household_id: householdId,
        name,
        normalized_key: key,
        aliases: Array.from(new Set(g.names.map((n) => n.trim()))).filter((n) => n !== name),
        category,
        unit_kind: unitKind(unit),
        display_unit: unit,
        is_meat: category === "meat",
      };
    });
  for (const batch of chunk(toCreate, 100)) {
    const { error } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "household_id,normalized_key", ignoreDuplicates: true });
    if (error) throw error;
  }
  const fresh = (await fetchAll<Product>("products", householdId)).map(normProduct);

  for (const [key, g] of Array.from(groups.entries())) {
    const p = fresh.find((x) => x.normalized_key === key);
    if (!p) continue;
    for (const ids of chunk(g.itemIds)) {
      const { error } = await supabase.from("inventory_items").update({ product_id: p.id }).in("id", ids).is("product_id", null);
      if (error) throw error;
    }
    for (const ids of chunk(g.eventIds)) {
      const { error } = await supabase.from("usage_log").update({ product_id: p.id }).in("id", ids).is("product_id", null);
      if (error) throw error;
    }
    // Remember naming variants as aliases on products that already existed.
    const variants = Array.from(new Set(g.names.map((n) => n.trim()))).filter(
      (n) => n !== p.name && !p.aliases.includes(n)
    );
    if (variants.length) {
      await supabase.from("products").update({ aliases: [...p.aliases, ...variants] }).eq("id", p.id);
    }
  }
  for (const l of listRows) {
    const p = findExact(l.item_name, fresh);
    if (p) await supabase.from("shopping_list").update({ product_id: p.id }).eq("id", l.id).is("product_id", null);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------
async function logActivity(entry: Omit<ActivityEntry, "id" | "at" | "summary" | "before" | "after" | "product_id" | "package_id"> & Partial<ActivityEntry>) {
  const { data } = await supabase.from("activity_log").insert(entry).select("id").single();
  return (data?.id as string | undefined) ?? null;
}

async function dropActivity(id: string | null) {
  if (id) await supabase.from("activity_log").delete().eq("id", id);
}

export async function fetchActivity(householdId: string, opts: { packageId?: string; limit?: number } = {}) {
  let q = supabase.from("activity_log").select("*").eq("household_id", householdId).order("at", { ascending: false });
  if (opts.packageId) q = q.eq("package_id", opts.packageId);
  const { data, error } = await q.limit(opts.limit ?? 200);
  if (error) throw error;
  return (data ?? []) as ActivityEntry[];
}

const snapshot = (p: InventoryItem) => ({
  quantity: p.quantity,
  unit: p.unit,
  expiration_date: p.expiration_date,
  added_at: p.added_at,
  storage: p.storage,
  product_id: p.product_id,
  name: p.name,
});

// ---------------------------------------------------------------------------
// Use / Toss (writes a usage event) — Delete (doesn't)
// ---------------------------------------------------------------------------
export interface UseInput {
  pkg: InventoryItem;
  product: Product;
  amount: number; // in the package's own unit
  kind: "used" | "tossed";
  tossReason?: "expired" | "spoiled";
  occurredAt: Date;
  userId: string | null;
}

export async function logUse(input: UseInput): Promise<() => Promise<void>> {
  const { pkg, product, amount, kind, tossReason, occurredAt, userId } = input;
  const take = Math.min(amount, pkg.quantity);
  const { data: event, error } = await supabase
    .from("usage_log")
    .insert({
      household_id: pkg.household_id,
      product_id: product.id,
      package_id: pkg.id,
      item_name: product.name,
      category: product.category,
      quantity_removed: take,
      unit: pkg.unit,
      reason: kind === "used" ? "used" : "expired",
      kind,
      toss_reason: kind === "tossed" ? tossReason ?? "expired" : null,
      occurred_at: occurredAt.toISOString(),
      removed_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  const remaining = Math.max(0, Math.round((pkg.quantity - take) * 1000) / 1000);
  if (remaining <= 0) {
    const { error: e2 } = await supabase.from("inventory_items").delete().eq("id", pkg.id);
    if (e2) throw e2;
  } else {
    const { error: e2 } = await supabase.from("inventory_items").update({ quantity: remaining }).eq("id", pkg.id);
    if (e2) throw e2;
  }
  const actId = await logActivity({
    household_id: pkg.household_id,
    type: kind === "used" ? "use" : "toss",
    product_id: product.id,
    package_id: pkg.id,
    summary: `${kind === "used" ? "Used" : "Tossed"} ${take} ${pkg.unit} of ${product.name}`,
    before: snapshot(pkg),
    after: { quantity: remaining },
    actor: userId,
  });

  return async () => {
    await supabase.from("usage_log").delete().eq("id", event.id);
    if (remaining <= 0) {
      const { id, household_id, product_id, name, category, quantity, unit, original_quantity, expiration_date, added_at, storage, source, barcode, photo_url, notes, added_by, created_at } = pkg;
      const { error: e3 } = await supabase.from("inventory_items").insert({
        id, household_id, product_id, name, category, quantity, unit, original_quantity, expiration_date, added_at, storage, source, barcode, photo_url, notes, added_by, created_at,
      });
      if (e3) throw e3;
    } else {
      await supabase.from("inventory_items").update({ quantity: pkg.quantity }).eq("id", pkg.id);
    }
    await dropActivity(actId);
  };
}

/** Removes a mistaken entry. Never writes a usage event. */
export async function deletePackage(pkg: InventoryItem, product: Product | undefined, userId: string | null) {
  await logActivity({
    household_id: pkg.household_id,
    type: "delete",
    product_id: pkg.product_id,
    package_id: pkg.id,
    summary: `Deleted ${pkg.quantity} ${pkg.unit} ${product?.name ?? pkg.name} entry`,
    before: { ...snapshot(pkg), category: pkg.category, created_at: pkg.created_at },
    actor: userId,
  });
  const { error } = await supabase.from("inventory_items").delete().eq("id", pkg.id);
  if (error) throw error;
}

export interface PackageEdit {
  quantity: number;
  unit: Unit;
  expiration_date: string | null;
  added_at: string;
  storage: InventoryItem["storage"];
  product: Product;
}

export async function editPackage(pkg: InventoryItem, edit: PackageEdit, userId: string | null) {
  const after = {
    quantity: edit.quantity,
    unit: edit.unit,
    expiration_date: edit.expiration_date,
    added_at: edit.added_at,
    storage: edit.storage,
    product_id: edit.product.id,
    name: edit.product.name,
    category: edit.product.category,
  };
  const { error } = await supabase.from("inventory_items").update(after).eq("id", pkg.id);
  if (error) throw error;
  const changes: string[] = [];
  if (pkg.quantity !== edit.quantity || pkg.unit !== edit.unit)
    changes.push(`${pkg.quantity} ${pkg.unit} → ${edit.quantity} ${edit.unit}`);
  if (pkg.product_id !== edit.product.id) changes.push(`moved to ${edit.product.name}`);
  if (pkg.expiration_date !== edit.expiration_date) changes.push("expiry");
  if (pkg.added_at !== edit.added_at) changes.push("date added");
  if (pkg.storage !== edit.storage) changes.push("storage");
  if (changes.length) {
    await logActivity({
      household_id: pkg.household_id,
      type: "edit",
      product_id: edit.product.id,
      package_id: pkg.id,
      summary: changes.join(", "),
      before: snapshot(pkg),
      after,
      actor: userId,
    });
  }
}

export async function duplicatePackage(pkg: InventoryItem, userId: string | null) {
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      household_id: pkg.household_id,
      product_id: pkg.product_id,
      name: pkg.name,
      category: pkg.category,
      quantity: pkg.quantity,
      unit: pkg.unit,
      original_quantity: pkg.quantity,
      expiration_date: pkg.expiration_date,
      added_at: todayISO(),
      storage: pkg.storage,
      source: "manual",
      added_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  await logActivity({
    household_id: pkg.household_id,
    type: "add",
    product_id: pkg.product_id,
    package_id: data.id,
    summary: `Duplicated ${pkg.quantity} ${pkg.unit} ${pkg.name}`,
    actor: userId,
  });
  return async () => {
    await supabase.from("inventory_items").delete().eq("id", data.id);
  };
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------
export interface AddInput {
  householdId: string;
  userId: string | null;
  /** Existing product, or null to create one from typedName/category. */
  product: Product | null;
  typedName: string;
  category: Category;
  size: number;
  unit: Unit;
  count: number;
  expires: string | null;
  addedAt: string;
  storage?: InventoryItem["storage"];
  source: NonNullable<InventoryItem["source"]>;
  barcode?: string | null;
  photoUrl?: string | null;
}

export async function ensureProduct(
  householdId: string,
  name: string,
  category: Category,
  unit: Unit
): Promise<Product> {
  const key = normalizedKey(name);
  const { data: existing } = await supabase
    .from("products")
    .select("*")
    .eq("household_id", householdId)
    .eq("normalized_key", key)
    .maybeSingle();
  if (existing) return normProduct(existing as Product);
  const { data, error } = await supabase
    .from("products")
    .insert({
      household_id: householdId,
      name: name.trim(),
      normalized_key: key,
      aliases: [],
      category,
      unit_kind: unitKind(unit),
      display_unit: unit,
      is_meat: category === "meat",
    })
    .select("*")
    .single();
  if (error) {
    // Lost a race with the other phone: use theirs.
    const { data: again } = await supabase
      .from("products")
      .select("*")
      .eq("household_id", householdId)
      .eq("normalized_key", key)
      .single();
    if (again) return normProduct(again as Product);
    throw error;
  }
  return normProduct(data as Product);
}

export async function addPackages(input: AddInput) {
  const product =
    input.product ?? (await ensureProduct(input.householdId, input.typedName, input.category, input.unit));

  // Remember the typed spelling, so it matches next time.
  const typed = input.typedName.trim();
  const productUpdate: Partial<Product> = {
    default_package_size: toBase(input.size, input.unit),
    display_unit: unitKind(input.unit) === product.unit_kind ? input.unit : product.display_unit,
  };
  if (typed && typed !== product.name && !product.aliases.includes(typed) && normalizedKey(typed) === product.normalized_key) {
    productUpdate.aliases = [...product.aliases, typed];
  }
  if (input.expires) {
    const days = Math.round((parseDay(input.expires).getTime() - parseDay(input.addedAt).getTime()) / 86400000);
    if (days > 0) productUpdate.default_shelf_life_days = days;
  }
  await supabase.from("products").update(productUpdate).eq("id", product.id);

  const rows = Array.from({ length: Math.max(1, input.count) }, () => ({
    household_id: input.householdId,
    product_id: product.id,
    name: product.name,
    category: product.category,
    quantity: input.size,
    unit: input.unit,
    original_quantity: input.size,
    expiration_date: input.expires,
    added_at: input.addedAt,
    storage: input.storage ?? null,
    source: input.source,
    barcode: input.barcode ?? null,
    photo_url: input.photoUrl ?? null,
    added_by: input.userId,
  }));
  const { data, error } = await supabase.from("inventory_items").insert(rows).select("id");
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id as string);
  const actIds = await Promise.all(
    ids.map((id) =>
      logActivity({
        household_id: input.householdId,
        type: "add",
        product_id: product.id,
        package_id: id,
        summary: `Added ${input.size} ${input.unit} ${product.name} via ${input.source.replace("_", " ")}`,
        actor: input.userId,
      })
    )
  );
  return {
    product,
    ids,
    undo: async () => {
      await supabase.from("inventory_items").delete().in("id", ids);
      await Promise.all(actIds.map(dropActivity));
    },
  };
}

// ---------------------------------------------------------------------------
// Products: rename, recategorize, merge
// ---------------------------------------------------------------------------
export async function renameProduct(p: Product, name: string, category: Category, userId: string | null) {
  const key = normalizedKey(name);
  const aliases = name.trim() !== p.name && !p.aliases.includes(p.name) ? [...p.aliases, p.name] : p.aliases;
  const { error } = await supabase
    .from("products")
    .update({ name: name.trim(), normalized_key: key, aliases, category, is_meat: category === "meat" ? true : p.category === "meat" ? false : p.is_meat })
    .eq("id", p.id);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error("Another product already has that name. Use Merge duplicates instead.");
    throw error;
  }
  if (category !== p.category) {
    await supabase.from("inventory_items").update({ category }).eq("product_id", p.id);
  }
  await logActivity({
    household_id: p.household_id,
    type: "edit",
    product_id: p.id,
    summary: `Renamed ${p.name} → ${name.trim()}`,
    actor: userId,
  });
}

export async function mergeProducts(survivor: Product, loser: Product, userId: string | null) {
  for (const table of ["inventory_items", "usage_log", "shopping_list"]) {
    const patch: Record<string, unknown> = { product_id: survivor.id };
    if (table === "inventory_items") patch.category = survivor.category;
    const { error } = await supabase.from(table).update(patch).eq("product_id", loser.id);
    if (error) throw error;
  }
  const aliases = Array.from(new Set([...survivor.aliases, loser.name, ...loser.aliases])).filter((a) => a !== survivor.name);
  const { error: e1 } = await supabase.from("products").update({ aliases }).eq("id", survivor.id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("products").delete().eq("id", loser.id);
  if (e2) throw e2;
  await logActivity({
    household_id: survivor.household_id,
    type: "merge",
    product_id: survivor.id,
    summary: `Merged ${loser.name} into ${survivor.name}`,
    before: { loser_id: loser.id, loser_name: loser.name },
    actor: userId,
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function saveSettings(s: HouseholdSettings) {
  // Before the freezer-space column exists, the loaded settings won't have
  // the field at all; leave it out so other settings still save.
  const { freezer_capacity_g, ...rest } = s;
  const payload = freezer_capacity_g === undefined ? rest : { ...rest, freezer_capacity_g };
  const { error } = await supabase.from("household_settings").upsert({ ...payload, updated_at: new Date().toISOString() });
  if (error) {
    if (/freezer_capacity_g/.test(error.message)) {
      throw new Error("Freezer space needs a quick database update first (supabase/migrations/2026-10-29_freezer_space.sql).");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------
export async function addToList(
  householdId: string,
  item: { name: string; category: Category; productId: string | null; quantityText: string | null; source: "manual" | "suggested" },
  userId: string | null
) {
  const { error } = await supabase.from("shopping_list").insert({
    household_id: householdId,
    item_name: item.name,
    category: item.category,
    product_id: item.productId,
    quantity_text: item.quantityText,
    source: item.source,
    added_by: userId,
  });
  if (error) throw error;
}

export async function setChecked(id: string, checked: boolean) {
  const { error } = await supabase.from("shopping_list").update({ checked }).eq("id", id);
  if (error) throw error;
}

export async function removeFromList(id: string) {
  const { error } = await supabase.from("shopping_list").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Reset (only ever runs after the user types RESET)
// ---------------------------------------------------------------------------
export function cutoffInstant(cutoffDay: string) {
  return endOfDay(parseDay(cutoffDay)).toISOString();
}

export async function eraseUsageThrough(householdId: string, cutoffDay: string, count: number, userId: string | null) {
  const cutoff = cutoffInstant(cutoffDay);
  const { error } = await supabase
    .from("usage_log")
    .delete()
    .eq("household_id", householdId)
    .lte("occurred_at", cutoff);
  if (error) throw error;
  await logActivity({
    household_id: householdId,
    type: "reset",
    summary: `Erased ${count} usage logs on or before ${cutoffDay}`,
    actor: userId,
  });
}

export async function resetEverything(householdId: string, userId: string | null) {
  for (const table of ["shopping_list", "usage_log", "inventory_items", "products", "activity_log"]) {
    const { error } = await supabase.from(table).delete().eq("household_id", householdId);
    if (error) throw error;
  }
  await logActivity({ household_id: householdId, type: "reset", summary: "Reset everything", actor: userId });
}

// ---------------------------------------------------------------------------
// CSV export (products, packages, usage events in one file)
// ---------------------------------------------------------------------------
export function buildCsv(data: KitchenData) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const name = (id: string | null) => data.products.find((p) => p.id === id)?.name ?? "";
  const header = ["record", "id", "product", "category", "quantity", "unit", "kind", "date", "expires", "added", "storage", "aliases"];
  const rows: unknown[][] = [
    ...data.products.map((p) => ["product", p.id, p.name, p.category, "", p.display_unit, p.unit_kind, p.created_at, "", "", "", p.aliases]),
    ...data.packages.map((p) => ["package", p.id, name(p.product_id) || p.name, p.category, p.quantity, p.unit, "", p.created_at, p.expiration_date, p.added_at, p.storage, ""]),
    ...data.events.map((e) => ["usage", e.id, name(e.product_id) || e.item_name, e.category, e.quantity_removed, e.unit, e.kind ?? e.reason, eventTime(e), "", "", "", ""]),
  ];
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

// ---------------------------------------------------------------------------
// Household members and invites
// ---------------------------------------------------------------------------
export interface Person {
  user_id: string;
  display_name: string | null;
  email: string | null;
  is_me: boolean;
}
export interface Invite {
  id: string;
  household_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  accepted_at: string | null;
  token: string;
}

const needsInviteSql = (msg: string) =>
  /household_invites|household_people|accept_household_invite|schema cache|does not exist/i.test(msg);

export async function fetchHousehold(householdId: string) {
  const [people, invites] = await Promise.all([
    supabase.rpc("household_people"),
    supabase.from("household_invites").select("*").eq("household_id", householdId).is("accepted_at", null).order("created_at"),
  ]);
  if (people.error && needsInviteSql(people.error.message)) return { ready: false as const };
  if (people.error) throw people.error;
  if (invites.error) throw invites.error;
  return { ready: true as const, people: (people.data ?? []) as Person[], invites: (invites.data ?? []) as Invite[] };
}

export async function createInvite(householdId: string, email: string, name: string, userId: string | null) {
  const clean = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("household_invites")
    .insert({ household_id: householdId, email: clean, display_name: name.trim() || null, invited_by: userId })
    .select("token")
    .single();
  if (!error) return { email: clean, token: data.token as string };
  // Already invited: reuse that invite's link.
  if (!/duplicate|unique/i.test(error.message)) throw error;
  const { data: existing, error: e2 } = await supabase
    .from("household_invites")
    .select("token")
    .eq("household_id", householdId)
    .ilike("email", clean)
    .is("accepted_at", null)
    .single();
  if (e2) throw e2;
  return { email: clean, token: existing.token as string };
}

export async function cancelInvite(id: string) {
  const { error } = await supabase.from("household_invites").delete().eq("id", id);
  if (error) throw error;
}

export function inviteLink(token: string) {
  return `${window.location.origin}/join/${token}`;
}
