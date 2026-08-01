import { supabase } from "./supabaseClient";
import type { ShoppingListItem } from "./types";

export async function fetchShoppingList(householdId: string) {
  const { data, error } = await supabase
    .from("shopping_list")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShoppingListItem[];
}

export async function markPurchased(id: string) {
  const { error } = await supabase.from("shopping_list").delete().eq("id", id);
  if (error) throw error;
}
