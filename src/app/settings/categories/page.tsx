"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useKitchen } from "@/lib/KitchenProvider";
import { CATEGORIES } from "@/lib/types";
import { BackButton, CategoryTile } from "@/components/ui";

export default function CategoriesPage() {
  const k = useKitchen();
  return (
    <div className="mx-auto max-w-[560px]">
      <header className="flex items-center gap-3 px-5 pb-1.5 pt-4">
        <BackButton href="/settings" label="Back to settings" />
        <h1 className="d m-0 text-[26px] font-extrabold">Categories</h1>
      </header>
      <main className="flex flex-col gap-3 px-5 pt-3.5">
        <div className="card overflow-hidden">
          {CATEGORIES.map((c) => {
            const products = k.products.filter((p) => p.category === c.value).length;
            const packages = k.packages.filter((p) => p.category === c.value).length;
            return (
              <Link key={c.value} href={`/category/${c.value}`} className="flex min-h-[60px] items-center gap-3 border-t border-divider px-4 py-2 first:border-t-0">
                <CategoryTile category={c.value} size={36} radius={11} />
                <span className="flex flex-1 flex-col">
                  <span className="font-bold">{c.label}</span>
                  <span className="text-xs text-muted">
                    {products} product{products === 1 ? "" : "s"} · {packages} package{packages === 1 ? "" : "s"}
                  </span>
                </span>
                <ChevronRight size={18} className="text-[#9AA79F]" aria-hidden />
              </Link>
            );
          })}
        </div>
        <p className="text-[13px] text-muted">To move a product to a different category, edit it in Product names.</p>
      </main>
    </div>
  );
}
