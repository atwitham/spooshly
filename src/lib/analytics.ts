import { supabase } from "./supabaseClient";
import type { Category } from "./types";

export interface UsageSummaryRow {
  item_name: string;
  unit: string;
  total: number;
  entries: number;
}

export interface UsageSummary {
  rows: UsageSummaryRow[];
  totalAllItems: number;
  days: number;
}

export async function fetchUsageSummary(
  householdId: string,
  category: Category,
  startDate: string,
  endDate: string
): Promise<UsageSummary> {
  const { data, error } = await supabase
    .from("usage_log")
    .select("item_name, quantity_removed, unit, created_at")
    .eq("household_id", householdId)
    .eq("category", category)
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (error) throw error;

  const byItem = new Map<string, UsageSummaryRow>();
  let totalAllItems = 0;

  for (const row of data ?? []) {
    const key = `${row.item_name}__${row.unit}`;
    const existing = byItem.get(key) ?? {
      item_name: row.item_name,
      unit: row.unit,
      total: 0,
      entries: 0,
    };
    existing.total += Number(row.quantity_removed);
    existing.entries += 1;
    byItem.set(key, existing);
    totalAllItems += Number(row.quantity_removed);
  }

  const days = Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
  );

  return {
    rows: Array.from(byItem.values()).sort((a, b) => b.total - a.total),
    totalAllItems,
    days,
  };
}
