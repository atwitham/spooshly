"use client";

import { useState } from "react";
import { ChevronDown, Beef } from "lucide-react";
import { format } from "date-fns";
import type { InventoryItem } from "@/lib/types";
import { removeFromInventory } from "@/lib/inventory";
import { useAuth } from "@/lib/AuthProvider";

interface Group {
  name: string;
  unit: string;
  total: number;
  packages: InventoryItem[];
}

function groupByName(items: InventoryItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const item of items) {
    const key = `${item.name}__${item.unit}`;
    const group = map.get(key) ?? { name: item.name, unit: item.unit, total: 0, packages: [] };
    group.total += item.quantity;
    group.packages.push(item);
    map.set(key, group);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function packageLabel(item: InventoryItem) {
  if (item.expiration_date) return `expires ${format(new Date(item.expiration_date), "MMM yyyy")}`;
  return `packed ${format(new Date(item.created_at), "MMM yyyy")}`;
}

export default function MeatGroupList({
  items,
  onChanged,
}: {
  items: InventoryItem[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const groups = groupByName(items);

  async function handleRemovePackage(item: InventoryItem) {
    await removeFromInventory(item, item.quantity, "used", user?.id ?? null);
    onChanged();
  }

  if (groups.length === 0) {
    return <p className="item-meta">Nothing in Meat and frozen yet.</p>;
  }

  return (
    <div className="space-y-2 pb-4">
      {groups.map((group) => {
        const key = `${group.name}__${group.unit}`;
        const open = openGroup === key;
        return (
          <div key={key} className="overflow-hidden rounded-card border border-line">
            <button
              onClick={() => setOpenGroup(open ? null : key)}
              className="flex w-full items-center gap-3 bg-paper p-3 text-left"
            >
              <Beef size={18} color="#17A45E" />
              <span className="flex-1">
                <span className="item-name">{group.name}</span>
                <span className="item-meta">
                  {" "}
                  · {group.total} {group.unit} total · {group.packages.length} package
                  {group.packages.length !== 1 ? "s" : ""}
                </span>
              </span>
              <ChevronDown
                size={18}
                color="#123528"
                style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease-out" }}
              />
            </button>
            {open && (
              <div className="border-t border-line">
                {group.packages.map((pkg, i) => (
                  <div
                    key={pkg.id}
                    className={`flex items-center justify-between p-3 ${
                      i < group.packages.length - 1 ? "border-b border-line" : ""
                    }`}
                  >
                    <span className="item-meta">
                      {pkg.quantity} {pkg.unit} · {packageLabel(pkg)}
                    </span>
                    <button onClick={() => handleRemovePackage(pkg)} className="pill-secondary">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
