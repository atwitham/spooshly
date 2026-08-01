export type Category = "seasoning" | "oil" | "meat" | "produce" | "pantry" | "essentials" | "other";

export const CATEGORIES: { value: Category; label: string; emoji: string }[] = [
  { value: "meat", label: "Meat & Frozen", emoji: "🥩" },
  { value: "seasoning", label: "Seasoning & Spices", emoji: "🧂" },
  { value: "oil", label: "Oils & Condiments", emoji: "🫒" },
  { value: "essentials", label: "Home Essentials", emoji: "🧴" },
  { value: "produce", label: "Produce", emoji: "🥬" },
  { value: "pantry", label: "Pantry", emoji: "🥫" },
  { value: "other", label: "Other", emoji: "📦" },
];

// Categories that get the simple flat-row + Restock treatment, everything
// except meat (which groups by name into expandable packages).
export const SIMPLE_CATEGORIES: Category[] = ["seasoning", "oil", "essentials", "produce", "pantry", "other"];

// Categories where quantity can be nudged up/down in place instead of only
// removed wholesale (things you use gradually rather than "use up" at once).
export const STEPPER_CATEGORIES: Category[] = ["seasoning", "oil", "essentials"];

// Categories where adding a new item with a name that already exists merges
// into the existing row (adds to its quantity) instead of creating a
// duplicate. Meat is excluded on purpose: each package is kept distinct
// because packages can have different weights and dates.
export const MERGE_ON_ADD_CATEGORIES: Category[] = [
  "seasoning",
  "oil",
  "essentials",
  "produce",
  "pantry",
  "other",
];

export type Unit = "oz" | "lb" | "g" | "kg" | "count" | "ml" | "l";

export interface InventoryItem {
  id: string;
  household_id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: Unit;
  expiration_date: string | null;
  barcode: string | null;
  photo_url: string | null;
  notes: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageLogEntry {
  id: string;
  household_id: string;
  item_name: string;
  category: Category;
  quantity_removed: number;
  unit: Unit;
  reason: "used" | "expired" | "restocked" | "other";
  removed_by: string | null;
  created_at: string;
}

export interface ShoppingListItem {
  id: string;
  household_id: string;
  item_name: string;
  category: Category;
  added_by: string | null;
  created_at: string;
}
