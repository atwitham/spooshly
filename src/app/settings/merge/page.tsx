"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { mergeProducts } from "@/lib/db";
import { duplicatePairs } from "@/lib/normalize";
import type { Product } from "@/lib/types";
import { BackButton, CategoryTile } from "@/components/ui";

export default function MergePage() {
  const { user } = useAuth();
  const k = useKitchen();
  const pairs = useMemo(() => duplicatePairs(k.products), [k.products]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [ignored, setIgnored] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const stats = (p: Product) => ({
    pk: k.packages.filter((x) => x.product_id === p.id).length,
    uses: k.events.filter((x) => x.product_id === p.id).length,
  });

  async function merge(a: Product, b: Product, key: string) {
    const survivorId = pick[key] ?? (stats(a).pk + stats(a).uses >= stats(b).pk + stats(b).uses ? a.id : b.id);
    const survivor = survivorId === a.id ? a : b;
    const loser = survivorId === a.id ? b : a;
    setBusy(key);
    try {
      await mergeProducts(survivor, loser, user?.id ?? null);
      await k.reload();
      k.toast(`Merged into ${survivor.name}`);
    } finally {
      setBusy(null);
    }
  }

  const visible = pairs.filter(([a, b]) => !ignored[`${a.id}:${b.id}`]);

  return (
    <div className="mx-auto max-w-[560px]">
      <header className="flex items-center gap-3 px-5 pb-1.5 pt-4">
        <BackButton href="/settings" label="Back to settings" />
        <h1 className="d m-0 text-[26px] font-extrabold">Merge duplicates</h1>
      </header>
      <main className="flex flex-col gap-3 px-5 pt-3.5">
        <p className="text-sm leading-relaxed text-muted">
          Pick the name to keep. Packages and usage history move over, and the other name is remembered so it matches next time.
        </p>
        {visible.length === 0 && <div className="card p-5 text-center text-sm text-muted">No look-alike products right now.</div>}
        {visible.map(([a, b]) => {
          const key = `${a.id}:${b.id}`;
          const sa = stats(a);
          const sb = stats(b);
          const chosen = pick[key] ?? (sa.pk + sa.uses >= sb.pk + sb.uses ? a.id : b.id);
          return (
            <div key={key} className="card flex flex-col gap-3 p-4">
              <div role="radiogroup" aria-label="Name to keep" className="flex flex-col gap-2">
                {[
                  [a, sa],
                  [b, sb],
                ].map(([p, s]) => {
                  const prod = p as Product;
                  const st = s as typeof sa;
                  const on = chosen === prod.id;
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPick((x) => ({ ...x, [key]: prod.id }))}
                      className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left ${on ? "border-primary bg-primary-tint" : "border-line"}`}
                    >
                      <CategoryTile category={prod.category} size={36} radius={11} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-bold">{prod.name}</span>
                        <span className="text-xs text-muted">
                          {st.pk} package{st.pk === 1 ? "" : "s"} · {st.uses} logged use{st.uses === 1 ? "" : "s"}
                        </span>
                      </span>
                      {on && <span className="text-xs font-bold text-primary-tint-ink">Keep</span>}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setIgnored((x) => ({ ...x, [key]: true }))} className="h-12 rounded-[14px] bg-chip font-bold">
                  Not the same
                </button>
                <button type="button" disabled={busy === key} onClick={() => merge(a, b, key)} className="btn-primary h-12 rounded-[14px]">
                  {busy === key ? "Merging…" : "Merge"}
                </button>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
