export type Category = "seasoning" | "oil" | "meat" | "produce" | "pantry" | "essentials" | "other";

export interface CategoryMeta {
  value: Category;
  label: string;
  short: string;
  tint: string;
  ink: string;
  /**
   * How dates work for this category:
   *  - "expires": a real use-by date (food safety). Filled in automatically,
   *    shows in Use soon, turns red and offers Toss when it passes.
   *  - "best_by": an optional quality date. Never filled in for you, never
   *    nags, never "expires" — just notes when it's past its best.
   *  - "none": no date at all.
   */
  dateKind: "expires" | "best_by" | "none";
  /** Default shelf life for new packages, in days (only for "expires"). */
  shelfLifeDays: number | null;
  /** Noun used for one count-unit package (e.g. "1 jar"). */
  countNoun: string;
}

// Sort order = display order.
export const CATEGORIES: CategoryMeta[] = [
  { value: "meat", label: "Meat & Frozen", short: "Meat", tint: "#FFE4DA", ink: "#C2410C", dateKind: "expires", shelfLifeDays: 182, countNoun: "pack" },
  { value: "seasoning", label: "Seasoning & Spices", short: "Seasoning", tint: "#FFF0CC", ink: "#A16207", dateKind: "best_by", shelfLifeDays: null, countNoun: "jar" },
  { value: "oil", label: "Oils & Condiments", short: "Oils", tint: "#FFF7C2", ink: "#A16207", dateKind: "best_by", shelfLifeDays: null, countNoun: "bottle" },
  { value: "essentials", label: "Home Essentials", short: "Essentials", tint: "#EDE7FF", ink: "#6D28D9", dateKind: "none", shelfLifeDays: null, countNoun: "pack" },
  { value: "produce", label: "Produce", short: "Produce", tint: "#E1F7E6", ink: "#15803D", dateKind: "expires", shelfLifeDays: 7, countNoun: "item" },
  { value: "pantry", label: "Pantry", short: "Pantry", tint: "#E0F0FF", ink: "#1D63C9", dateKind: "best_by", shelfLifeDays: null, countNoun: "item" },
  { value: "other", label: "Other", short: "Other", tint: "#EEF0EC", ink: "#4B5A52", dateKind: "none", shelfLifeDays: null, countNoun: "item" },
];

/** Does this category's date mean "unsafe after" (meat, produce)? */
export const hasRealExpiry = (category: string) => categoryMeta(category).dateKind === "expires";

export const categoryMeta = (c: Category | string): CategoryMeta =>
  CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[CATEGORIES.length - 1];

/** Where a package is kept. "freezer" is the main freezer (the original value). */
export type StorageLocation = "freezer" | "garage_freezer" | "fridge" | "pantry" | "cabinet";

export const STORAGE_LABEL: Record<StorageLocation, string> = {
  freezer: "Main freezer",
  garage_freezer: "Garage freezer",
  fridge: "Fridge",
  pantry: "Pantry",
  cabinet: "Cabinet",
};

/** Which locations to offer for a category, first = default. */
export function storageOptions(category: string): StorageLocation[] {
  if (category === "meat") return ["freezer", "garage_freezer"];
  if (category === "oil") return ["cabinet", "pantry", "fridge"];
  return ["pantry", "fridge", "freezer"];
}

/** Where a package lives. Meat saved before locations existed was in the main freezer. */
export function locationOf(p: { storage: StorageLocation | null; category: string }): StorageLocation | null {
  return p.storage ?? (p.category === "meat" ? "freezer" : null);
}

export type Unit = "oz" | "lb" | "g" | "kg" | "count" | "ml" | "l";
export const UNITS: Unit[] = ["oz", "lb", "g", "kg", "count", "ml", "l"];
export type UnitKind = "weight" | "volume" | "count";

export interface Product {
  id: string;
  household_id: string;
  name: string;
  normalized_key: string;
  aliases: string[];
  category: Category;
  unit_kind: UnitKind;
  display_unit: Unit;
  default_package_size: number | null;
  default_shelf_life_days: number | null;
  is_meat: boolean;
  created_at: string;
  updated_at: string;
}

/** A physical package. Stored in the existing `inventory_items` table. */
export interface InventoryItem {
  id: string;
  household_id: string;
  product_id: string | null;
  name: string;
  category: Category;
  quantity: number;
  unit: Unit;
  original_quantity: number | null;
  expiration_date: string | null;
  added_at: string | null;
  storage: StorageLocation | null;
  source: "manual" | "barcode" | "photo" | "shopping_list" | null;
  barcode: string | null;
  photo_url: string | null;
  notes: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}
export type Package = InventoryItem;

/** A usage event. Stored in the existing `usage_log` table. */
export interface UsageLogEntry {
  id: string;
  household_id: string;
  product_id: string | null;
  package_id: string | null;
  item_name: string;
  category: Category;
  quantity_removed: number;
  unit: Unit;
  reason: "used" | "expired" | "restocked" | "other";
  kind: "used" | "tossed" | null;
  toss_reason: "expired" | "spoiled" | null;
  occurred_at: string | null;
  removed_by: string | null;
  created_at: string;
}

/** Old rows written by the previous app version may have kind = null. */
export const eventKind = (e: UsageLogEntry): "used" | "tossed" =>
  e.kind ?? (e.reason === "expired" ? "tossed" : "used");
export const eventTime = (e: UsageLogEntry): string => e.occurred_at ?? e.created_at;

export interface ShoppingListItem {
  id: string;
  household_id: string;
  product_id: string | null;
  item_name: string;
  category: Category;
  quantity_text: string | null;
  source: "manual" | "suggested";
  checked: boolean;
  added_by: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  household_id: string;
  type: "add" | "use" | "toss" | "edit" | "delete" | "merge" | "reset";
  product_id: string | null;
  package_id: string | null;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string | null;
  at: string;
}

export interface HouseholdSettings {
  household_id: string;
  shop_every_days: 7 | 14 | 30;
  target_supply_weeks: 2 | 4 | 8;
  low_stock_warn_weeks: 1 | 2;
  expiry_reminder_days: 3 | 7;
  last_trip_at: string | null;
  /** How much fits in the freezer, in grams. null = not set. */
  freezer_capacity_g?: number | null;
}

export const DEFAULT_SETTINGS: Omit<HouseholdSettings, "household_id"> = {
  shop_every_days: 7,
  target_supply_weeks: 4,
  low_stock_warn_weeks: 2,
  expiry_reminder_days: 3,
  last_trip_at: null,
};
