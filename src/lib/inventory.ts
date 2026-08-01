import { supabase } from "./supabaseClient";
import type { Category, InventoryItem, Unit } from "./types";
import { MERGE_ON_ADD_CATEGORIES } from "./types";

export async function fetchItems(householdId: string, category?: Category) {
  let query = supabase
    .from("inventory_items")
    .select("*")
    .eq("household_id", householdId)
    .order("expiration_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InventoryItem[];
}

export async function fetchCategoryCounts(householdId: string) {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("category")
    .eq("household_id", householdId);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}

export async function fetchExpiringSoon(householdId: string, withinDays = 5) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("household_id", householdId)
    .not("expiration_date", "is", null)
    .lte("expiration_date", cutoff.toISOString().slice(0, 10))
    .order("expiration_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InventoryItem[];
}

export interface NewItemInput {
  household_id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: Unit;
  expiration_date: string | null;
  barcode?: string | null;
  photo_url?: string | null;
  notes?: string | null;
  added_by: string | null;
}

export async function addItem(input: NewItemInput) {
  const { data, error } = await supabase.from("inventory_items").insert(input).select().single();
  if (error) throw error;
  return data as InventoryItem;
}

/**
 * Add an item, but for categories where duplicates don't make sense
 * (everything except meat), if an item with the same name and unit already
 * exists in this category, merge into it by adding to its quantity instead
 * of creating a second row. Meat always creates a new package, since two
 * packages of "Chicken breast" are genuinely separate physical things.
 */
export async function addOrMergeItem(input: NewItemInput) {
  if (!MERGE_ON_ADD_CATEGORIES.includes(input.category)) {
    return addItem(input);
  }

  const { data: existing, error: findError } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("household_id", input.household_id)
    .eq("category", input.category)
    .eq("unit", input.unit)
    .ilike("name", input.name.trim())
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const merged = existing as InventoryItem;
    await updateItemQuantity(merged.id, merged.quantity + input.quantity);
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", merged.id)
      .single();
    if (error) throw error;
    return data as InventoryItem;
  }

  return addItem(input);
}

export async function updateItemQuantity(id: string, quantity: number) {
  const { error } = await supabase.from("inventory_items").update({ quantity }).eq("id", id);
  if (error) throw error;
}

/**
 * Remove (fully or partially) an item from inventory and log the usage.
 * If quantityRemoved >= item.quantity, the item is deleted entirely.
 * Otherwise the quantity is decremented. Every removal is logged to
 * usage_log so the meat-usage analytics can work off real history.
 */
export async function removeFromInventory(
  item: InventoryItem,
  quantityRemoved: number,
  reason: "used" | "expired" | "restocked" | "other",
  removedBy: string | null
) {
  const { error: logError } = await supabase.from("usage_log").insert({
    household_id: item.household_id,
    item_name: item.name,
    category: item.category,
    quantity_removed: quantityRemoved,
    unit: item.unit,
    reason,
    removed_by: removedBy,
  });
  if (logError) throw logError;

  const remaining = Math.max(0, item.quantity - quantityRemoved);
  if (remaining <= 0) {
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) throw error;
  } else {
    await updateItemQuantity(item.id, remaining);
  }
}

export async function deleteItem(id: string) {
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Restock: removes the item from inventory entirely and drops it onto the
 * shared shopping list in one action. Used by every non-meat category row.
 */
export async function restockItem(item: InventoryItem, removedBy: string | null) {
  await removeFromInventory(item, item.quantity, "restocked", removedBy);
  const { error } = await supabase.from("shopping_list").insert({
    household_id: item.household_id,
    item_name: item.name,
    category: item.category,
    added_by: removedBy,
  });
  if (error) throw error;
}

/**
 * Nudge a quantity up or down in place, for items used gradually (home
 * essentials) rather than removed wholesale. Never goes below 0.
 */
export async function adjustQuantity(item: InventoryItem, delta: number) {
  const next = Math.max(0, item.quantity + delta);
  await updateItemQuantity(item.id, next);
  return next;
}
