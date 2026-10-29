"use client";

import { useState } from "react";
import { Snowflake } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { saveSettings } from "@/lib/db";
import { freezerSpace } from "@/lib/insights";
import { LB, fmtNum } from "@/lib/units";

const lb = (g: number) => fmtNum(Math.round((g / LB) * 2) / 2);

/**
 * "How full is the freezer?" — the simplest way to teach the app its
 * capacity is to tap a button the moment the freezer is full. It saves what
 * the app counts as in the freezer right now as the max.
 */
export default function FreezerSpace({ compact = false }: { compact?: boolean }) {
  const { householdId } = useAuth();
  const k = useKitchen();
  const f = freezerSpace(k.ctx);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(f.capacity ? lb(f.capacity) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(capacityG: number | null, message: string) {
    if (!householdId) return;
    setBusy(true);
    setErr(null);
    try {
      await saveSettings({ ...k.settings, household_id: householdId, freezer_capacity_g: capacityG });
      await k.reload();
      setEditing(false);
      k.toast(message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t save.");
    } finally {
      setBusy(false);
    }
  }

  const markFull = () => {
    if (f.used <= 0) {
      setErr("Add what’s in your freezer first, then tap this when it’s full.");
      return;
    }
    save(f.used, `Got it. Your freezer holds about ${lb(f.used)} lb.`);
  };

  const pct = f.pct === null ? 0 : Math.min(1, f.pct);
  const over = f.capacity !== null && f.used > f.capacity;
  const tone = f.pct === null ? "" : f.pct >= 0.95 ? "#B42318" : f.pct >= 0.8 ? "#D97706" : "#22C55E";

  return (
    <section aria-labelledby="freezer-h" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-info-tint text-info-ink">
          <Snowflake size={20} strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="freezer-h" className="d m-0 text-[17px] font-bold">
            Freezer space
          </h2>
          <p className="m-0 text-[13px] text-muted">
            {f.capacity === null
              ? `${lb(f.used)} lb in the freezer now`
              : over
                ? `${lb(f.used)} lb in a freezer that held ${lb(f.capacity)} lb`
                : (f.room ?? 0) < LB / 2
                  ? "Full · no room left"
                  : `${Math.round(pct * 100)}% full · room for about ${lb(f.room ?? 0)} lb more`}
          </p>
        </div>
      </div>

      {f.capacity !== null && (
        <div
          className="h-2.5 overflow-hidden rounded-full bg-divider"
          role="meter"
          aria-label="Freezer fullness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 100)}
        >
          <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct * 100)}%`, background: tone }} />
        </div>
      )}

      {!compact && f.capacity === null && !editing && (
        <p className="m-0 text-[13px] leading-snug text-muted">
          Tap the button the next time your freezer is packed. Splooshly remembers how much fits and stops suggesting more than you have room for.
        </p>
      )}
      {f.capacity !== null && f.room !== null && f.room <= 0 && (
        <p className="m-0 rounded-xl bg-danger-tint px-3 py-2 text-[13px] font-semibold text-danger-ink">
          Your freezer is full, so meat restock suggestions are paused until you use some.
        </p>
      )}
      {over && (
        <p className="m-0 text-[13px] text-muted">If it fits, tap “It’s full right now” to update the size.</p>
      )}

      {editing ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="lbl">How much fits in your freezer (lb)?</span>
            <input className="fld" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="e.g. 40" autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-12 rounded-[14px] bg-chip font-bold">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !(Number(value.replace(",", ".")) > 0)}
              onClick={() => save(Number(value.replace(",", ".")) * LB, "Freezer size saved")}
              className="btn-primary h-12 rounded-[14px]"
            >
              Save
            </button>
          </div>
          {f.capacity !== null && (
            <button type="button" disabled={busy} onClick={() => save(null, "Stopped tracking freezer space")} className="h-11 text-sm font-bold text-danger-ink">
              Stop tracking freezer space
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={markFull}
            className={`h-12 flex-1 rounded-[14px] text-[15px] font-bold ${f.capacity === null ? "btn-primary" : "bg-primary-tint text-primary-tint-ink"}`}
          >
            {f.capacity === null ? "My freezer is full right now" : "It’s full right now"}
          </button>
          <button type="button" onClick={() => (setValue(f.capacity ? lb(f.capacity) : ""), setEditing(true))} className="h-12 rounded-[14px] bg-chip px-4 text-[15px] font-bold">
            {f.capacity === null ? "Enter size" : "Edit"}
          </button>
        </div>
      )}
      {err && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger-ink">
          {err}
        </p>
      )}
    </section>
  );
}
