"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { findExact, suggest } from "@/lib/normalize";
import { type Product, categoryMeta } from "@/lib/types";
import { useKitchen } from "@/lib/KitchenProvider";
import { eventTime } from "@/lib/types";
import { centerOnFocus } from "./ui";

/**
 * Product name combobox with autocomplete (handoff §6.1). The suggestion
 * list renders inline below the field, in normal document flow, so it
 * pushes content down instead of floating over other controls.
 */
export default function ProductCombobox({
  id,
  value,
  onChange,
  onPick,
  onCreate,
  chosenId,
  placeholder = "Start typing, e.g. chicken",
  autoFocus,
  compact,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Product) => void;
  onCreate?: () => void;
  chosenId: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const { products, packages, events } = useKitchen();
  const [debounced, setDebounced] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 100);
    return () => clearTimeout(t);
  }, [value]);

  const stats = useMemo(() => {
    const inStock = new Map<string, number>();
    packages.forEach((p) => p.product_id && inStock.set(p.product_id, (inStock.get(p.product_id) ?? 0) + 1));
    const lastUsed = new Map<string, number>();
    events.forEach((e) => e.product_id && lastUsed.set(e.product_id, Math.max(lastUsed.get(e.product_id) ?? 0, new Date(eventTime(e)).getTime())));
    return (p: Product) => ({ inStock: inStock.get(p.id) ?? 0, lastUsed: lastUsed.get(p.id) ?? 0 });
  }, [packages, events]);

  const matches = useMemo(() => suggest(debounced, products, stats), [debounced, products, stats]);
  const exact = useMemo(() => findExact(debounced, products), [debounced, products]);
  const chosen = !!chosenId && products.find((p) => p.id === chosenId)?.name === value;
  const showList = !chosen && debounced.trim().length > 0 && (focused || matches.length > 0);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[18px] border-2 bg-surface ${focused ? "border-primary shadow-[0_0_0_4px_rgba(34,197,94,.16)]" : "border-line"}`}
    >
      <div className="flex items-center gap-2 pl-3.5 pr-1.5">
        <input
          id={id}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          enterKeyHint="next"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            centerOnFocus(e);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (exact) onPick(exact);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className={`min-w-0 flex-1 border-0 bg-transparent font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted ${compact ? "h-[50px] text-base" : "h-[52px] text-[17px]"}`}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear name"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-chip text-muted"
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>
      {showList && (
        <div id={`${id}-list`} role="listbox" aria-label="Matching products" className="flex flex-col border-t border-divider p-1">
          {matches.map((p) => {
            const isExact = exact?.id === p.id;
            const n = stats(p).inStock;
            const meta = categoryMeta(p.category);
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isExact}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(p)}
                className="flex min-h-[54px] items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-chip"
              >
                <span className="h-[34px] w-[34px] flex-none rounded-[11px]" style={{ background: meta.tint }} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold">{p.name}</span>
                  <span className="text-xs text-muted">
                    {meta.label} · {n > 0 ? `${n} in stock` : "none in stock"}
                  </span>
                </span>
                <span className={`flex-none rounded-full px-2.5 py-[5px] text-xs font-bold ${isExact ? "bg-accent text-ink" : "bg-chip text-ink"}`}>
                  {isExact ? "Same item" : "Use"}
                </span>
              </button>
            );
          })}
          {!exact && onCreate && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCreate}
              className="flex min-h-12 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[15px] font-bold text-primary hover:bg-chip"
            >
              <Plus size={18} strokeWidth={2.4} aria-hidden />
              Create “{value.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
