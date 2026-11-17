"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { renameProduct } from "@/lib/db";
import { findExact } from "@/lib/normalize";
import { CATEGORIES, type Category, type Product, categoryMeta } from "@/lib/types";
import { CategoryIcon, FullScreen, Spinner, centerOnFocus } from "@/components/ui";

/** Edit a product: fix its name or category. Every package of it follows. */
function ProductForm({ product }: { product: Product }) {
  const router = useRouter();
  const { user } = useAuth();
  const k = useKitchen();
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState<Category>(product.category);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const packages = k.packages.filter((p) => p.product_id === product.id).length;
  const uses = k.events.filter((e) => e.product_id === product.id).length;
  const moving = category !== product.category;
  const renaming = name.trim() !== product.name && name.trim().length > 0;
  const clash = useMemo(() => {
    const hit = renaming ? findExact(name, k.products) : undefined;
    return hit && hit.id !== product.id ? hit : null;
  }, [name, renaming, k.products, product.id]);

  async function save() {
    if (!moving && !renaming) return router.back();
    if (clash) return;
    setBusy(true);
    setErr(null);
    try {
      await renameProduct(product, name, category, user?.id ?? null);
      await k.reload();
      k.toast(moving ? `Moved ${name.trim()} to ${categoryMeta(category).label}` : `Renamed to ${name.trim()}`);
      router.replace(`/category/${category}?open=${product.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t save.");
      setBusy(false);
    }
  }

  const header = (
    <header className="flex items-center justify-between px-4 py-3.5">
      <button type="button" onClick={() => router.back()} className="btn-ghost h-11 px-3.5 text-[15px]">
        Cancel
      </button>
      <h1 className="d m-0 text-[19px] font-extrabold">Edit product</h1>
      <button type="button" onClick={save} disabled={busy || !!clash} className="btn-primary h-11 rounded-[14px] px-[18px] text-[15px]">
        Save
      </button>
    </header>
  );

  return (
    <FullScreen header={header}>
      <div className="flex flex-col gap-5 px-5 pb-8 pt-2">
        <label className="flex flex-col gap-1.5">
          <span className="lbl">Name</span>
          <input className="fld" value={name} onChange={(e) => setName(e.target.value)} onFocus={centerOnFocus} autoComplete="off" />
          {product.aliases.length > 0 && (
            <span className="text-xs text-muted">Also matches: {product.aliases.join(", ")}</span>
          )}
          {clash && (
            <span className="text-[13px] font-semibold text-danger-ink">
              “{clash.name}” already exists. To combine them, use Settings › Merge duplicates.
            </span>
          )}
        </label>

        <div className="flex flex-col gap-2">
          <span className="lbl" id="cat-l">
            Category
          </span>
          <div role="radiogroup" aria-labelledby="cat-l" className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => {
              const on = c.value === category;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCategory(c.value)}
                  className={`flex min-h-[56px] items-center gap-2.5 rounded-2xl border-2 bg-surface px-3 text-left text-[14px] font-bold ${on ? "border-primary" : "border-transparent shadow-soft"}`}
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl" style={{ background: c.tint, color: c.ink }}>
                    <CategoryIcon category={c.value} size={18} />
                  </span>
                  <span className="leading-tight">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {(moving || renaming) && !clash && (
          <div role="status" className="flex flex-col gap-1.5 rounded-2xl bg-primary-tint px-4 py-3.5 text-sm leading-snug text-[#0F3D22]">
            <strong className="flex flex-wrap items-center gap-1.5">
              {moving ? (
                <>
                  {categoryMeta(product.category).short} <ArrowRight size={14} aria-hidden /> {categoryMeta(category).short}
                </>
              ) : (
                "Rename"
              )}
            </strong>
            <span>
              All {packages} package{packages === 1 ? "" : "s"}
              {uses > 0 ? `, ${uses} logged use${uses === 1 ? "" : "s"}` : ""} and any list items move with it. When you add “{name.trim()}” later, it’ll
              suggest {categoryMeta(category).label}.
            </span>
          </div>
        )}
        {err && (
          <p role="alert" className="m-0 text-sm font-semibold text-danger-ink">
            {err}
          </p>
        )}
      </div>
    </FullScreen>
  );
}

function EditProduct() {
  const { id } = useParams<{ id: string }>();
  const k = useKitchen();
  const product = k.productById(id);
  if (!k.ready) return <Spinner />;
  if (!product) return <p className="px-5 pt-16 text-center font-bold">This product isn’t in your kitchen anymore.</p>;
  return <ProductForm key={product.id} product={product} />;
}

export default function EditProductPage() {
  return (
    <Suspense>
      <EditProduct />
    </Suspense>
  );
}
