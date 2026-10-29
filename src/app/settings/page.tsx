"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Clock, Download, GitMerge, LayoutGrid, List, Pencil, RotateCcw, ShoppingCart, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { buildCsv, saveSettings } from "@/lib/db";
import { duplicatePairs } from "@/lib/normalize";
import { supabase } from "@/lib/supabaseClient";
import type { HouseholdSettings } from "@/lib/types";
import { downloadCsv } from "@/lib/download";
import { BackButton } from "@/components/ui";
import FreezerSpace from "@/components/FreezerSpace";
import Household from "@/components/Household";

const row = "flex min-h-[60px] items-center gap-3.5 border-t border-divider px-4 py-2.5 first:border-t-0";
const ico = "flex h-9 w-9 flex-none items-center justify-center rounded-xl";
const sel = "h-11 rounded-xl border-0 bg-chip pl-3 pr-2 text-[15px] font-bold text-ink";

export default function SettingsPage() {
  const { displayName, user, householdId } = useAuth();
  const k = useKitchen();
  const [saving, setSaving] = useState(false);
  const name = (displayName ?? user?.email ?? "You").split(/[@\s]/)[0];
  const pairs = useMemo(() => duplicatePairs(k.products), [k.products]);

  async function update<K extends keyof HouseholdSettings>(key: K, value: HouseholdSettings[K]) {
    if (!householdId) return;
    setSaving(true);
    try {
      await saveSettings({ ...k.settings, household_id: householdId, [key]: value });
      await k.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <header className="flex items-center gap-3 px-5 pb-1.5 pt-4">
        <BackButton href="/" label="Back to home" />
        <h1 className="d m-0 text-[26px] font-extrabold">Settings</h1>
      </header>

      <main className="flex flex-col gap-[22px] px-5 pb-10 pt-3.5">
        <div className="flex items-center gap-3.5 rounded-3xl bg-ink p-[18px] text-white">
          <span className="d flex h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-accent text-[22px] font-extrabold text-ink">{name.charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="d truncate text-xl font-extrabold">{name}</div>
            <div className="truncate text-sm text-on-dark-muted">{user?.email} · {saving ? "saving…" : "synced"}</div>
          </div>
        </div>

        <Household />

        <section aria-labelledby="restock-h" className="flex flex-col gap-2">
          <h2 id="restock-h" className="eyebrow">
            Smart restock
          </h2>
          <div className="card overflow-hidden">
            <label className={row}>
              <span className={`${ico} bg-primary-tint text-primary`}>
                <ShoppingCart size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1 text-[15px] font-semibold">I shop every</span>
              <select className={sel} value={k.settings.shop_every_days} onChange={(e) => update("shop_every_days", Number(e.target.value) as 7)}>
                <option value={7}>1 week</option>
                <option value={14}>2 weeks</option>
                <option value={30}>Month</option>
              </select>
            </label>
            <label className={row}>
              <span className={`${ico} bg-[#FFE4DA] text-[#C2410C]`}>
                <LayoutGrid size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1 text-[15px] font-semibold">Keep on hand</span>
              <select className={sel} value={k.settings.target_supply_weeks} onChange={(e) => update("target_supply_weeks", Number(e.target.value) as 4)}>
                <option value={2}>2 weeks</option>
                <option value={4}>4 weeks</option>
                <option value={8}>8 weeks</option>
              </select>
            </label>
            <label className={row}>
              <span className={`${ico} bg-warn-tint text-warn-ink`}>
                <AlertTriangle size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1 text-[15px] font-semibold">Warn me when</span>
              <select className={sel} value={k.settings.low_stock_warn_weeks} onChange={(e) => update("low_stock_warn_weeks", Number(e.target.value) as 2)}>
                <option value={2}>2 wks left</option>
                <option value={1}>1 wk left</option>
              </select>
            </label>
            <label className={row}>
              <span className={`${ico} bg-info-tint text-info-ink`}>
                <Clock size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1 text-[15px] font-semibold">Expiry reminder</span>
              <select className={sel} value={k.settings.expiry_reminder_days} onChange={(e) => update("expiry_reminder_days", Number(e.target.value) as 3)}>
                <option value={3}>3 days before</option>
                <option value={7}>1 week before</option>
              </select>
            </label>
          </div>
        </section>

        <FreezerSpace />

        <section aria-labelledby="data-h" className="flex flex-col gap-2">
          <h2 id="data-h" className="eyebrow">
            Products &amp; data
          </h2>
          <div className="card overflow-hidden">
            <Link href="/settings/merge" className={row}>
              <span className={`${ico} bg-warn-tint text-warn-ink`}>
                <GitMerge size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold">Merge duplicates</span>
                <span className="truncate text-xs text-muted">
                  {pairs.length ? `“${pairs[0][0].name}” and “${pairs[0][1].name}” look alike` : "No look-alikes right now"}
                </span>
              </span>
              {pairs.length > 0 && <span className="rounded-full bg-[#FFB45C] px-[9px] py-[3px] text-xs font-extrabold text-[#3D2002]">{pairs.length}</span>}
            </Link>
            <Link href="/settings/products" className={row}>
              <span className={`${ico} bg-soft text-[#3E4F45]`}>
                <Pencil size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1 text-[15px] font-semibold">Product names</span>
              <ChevronRight size={18} className="text-[#9AA79F]" aria-hidden />
            </Link>
            <Link href="/settings/categories" className={row}>
              <span className={`${ico} bg-soft text-[#3E4F45]`}>
                <LayoutGrid size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1 text-[15px] font-semibold">Categories</span>
              <ChevronRight size={18} className="text-[#9AA79F]" aria-hidden />
            </Link>
            <Link href="/settings/activity" className={row}>
              <span className={`${ico} bg-soft text-[#3E4F45]`}>
                <List size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold">Activity log</span>
                <span className="text-xs text-muted">Every add, use, toss, edit and delete</span>
              </span>
              <ChevronRight size={18} className="text-[#9AA79F]" aria-hidden />
            </Link>
            <button type="button" onClick={() => downloadCsv(buildCsv(k))} className={`${row} w-full text-left`}>
              <span className={`${ico} bg-soft text-[#3E4F45]`}>
                <Download size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1 text-[15px] font-semibold">Export as CSV</span>
              <ChevronRight size={18} className="text-[#9AA79F]" aria-hidden />
            </button>
          </div>
        </section>

        <section aria-labelledby="reset-h" className="flex flex-col gap-2">
          <h2 id="reset-h" className="eyebrow !text-danger-ink">
            Reset
          </h2>
          <div className="card overflow-hidden">
            <Link href="/settings/reset?mode=usage" className={row}>
              <span className={`${ico} bg-danger-tint text-danger-ink`}>
                <RotateCcw size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-bold text-danger-ink">Erase usage history…</span>
                <span className="text-xs text-muted">Only logs on or before a date you pick</span>
              </span>
              <ChevronRight size={18} className="text-danger-ink" aria-hidden />
            </Link>
            <Link href="/settings/reset?mode=all" className={row}>
              <span className={`${ico} bg-danger-tint text-danger-ink`}>
                <Trash2 size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-bold text-danger-ink">Reset everything</span>
                <span className="text-xs text-muted">Items, products, history and lists</span>
              </span>
              <ChevronRight size={18} className="text-danger-ink" aria-hidden />
            </Link>
          </div>
          <p className="mx-1 mt-0.5 text-[13px] text-muted">Tip: export a CSV first if you might want this data later.</p>
        </section>

        <button type="button" onClick={() => supabase.auth.signOut()} className="btn-ghost h-[52px] rounded-2xl text-base font-bold">
          Sign out
        </button>
        <div className="text-center text-xs text-muted">Splooshly · v2.0</div>
      </main>
    </div>
  );
}
