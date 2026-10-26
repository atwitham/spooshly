"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { logUse } from "@/lib/db";
import type { InventoryItem, Product } from "@/lib/types";
import { fmtNum } from "@/lib/units";
import { fmtDay, parseDay, todayISO } from "@/lib/dates";
import { CategoryTile, ChoiceChips } from "./ui";

type Reason = "cooked" | "expired" | "spoiled";

export default function UseSheet({
  pkg,
  product,
  initialReason = "cooked",
  onClose,
}: {
  pkg: InventoryItem;
  product: Product;
  initialReason?: Reason;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast, reload } = useKitchen();
  const total = pkg.quantity;
  const isCount = pkg.unit === "count";
  const step = isCount ? 1 : 0.5;
  const unitLabel = isCount ? "" : ` ${pkg.unit}`;
  const [reason, setReason] = useState<Reason>(initialReason);
  const [amount, setAmount] = useState(isCount && total > 1 && initialReason === "cooked" ? 1 : total);
  const [day, setDay] = useState(todayISO());
  const [pickDate, setPickDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && sheetRef.current) {
        const f = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("button,input,a")).filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [onClose]);

  const tossed = reason !== "cooked";
  const left = Math.max(0, total - amount);
  const fractions = [
    { label: "¼", v: total / 4 },
    { label: "½", v: total / 2 },
    { label: "¾", v: (total * 3) / 4 },
    { label: "All", v: total },
  ].filter((f) => !isCount || Number.isInteger(f.v) || f.label === "All");

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const occurred = day === todayISO() ? new Date() : new Date(parseDay(day).getTime() + 12 * 3600000);
      const undo = await logUse({
        pkg,
        product,
        amount,
        kind: tossed ? "tossed" : "used",
        tossReason: reason === "spoiled" ? "spoiled" : "expired",
        occurredAt: occurred,
        userId: user?.id ?? null,
      });
      await reload();
      toast(`Logged ${fmtNum(amount)}${unitLabel || " count"} ${product.name} ${tossed ? "tossed" : "used"}`, undo);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 bg-[rgba(14,35,24,.5)] backdrop-blur-[3px]" onClick={onClose} />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="use-h"
        className="sheet-in absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-[520px] flex-col gap-5 overflow-y-auto rounded-t-[32px] bg-surface px-5 pt-2.5 shadow-sheet"
        style={{ paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }}
      >
        <div aria-hidden className="h-[5px] w-11 self-center rounded bg-[#DCE3DA]" />
        <div className="flex items-center gap-3.5">
          <CategoryTile category={product.category} size={52} radius={18} />
          <div className="min-w-0 flex-1">
            <h2 id="use-h" className="d m-0 text-[22px] font-extrabold leading-tight">
              {product.name}
            </h2>
            <p className="m-0 mt-0.5 text-sm text-muted">
              {fmtNum(total)}
              {unitLabel || " count"} package · added {fmtDay(pkg.added_at ?? pkg.created_at)}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-chip text-ink">
            <X size={22} strokeWidth={1.9} aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="lbl uppercase tracking-[0.06em]">What happened?</div>
          <ChoiceChips
            label="Reason"
            value={reason}
            onChange={setReason}
            options={[
              { value: "cooked", label: "Cooked" },
              { value: "expired", label: "Expired" },
              { value: "spoiled", label: "Spoiled" },
            ]}
          />
          <div className="text-[13px] text-muted">
            {tossed
              ? "Logged as waste, so it won’t inflate your usage or restock suggestions."
              : "Counts toward your usage, portions and meat runway."}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="lbl uppercase tracking-[0.06em]">How much?</div>
          <div className="flex items-center gap-3 rounded-[22px] bg-chip p-2.5">
            <button
              type="button"
              aria-label="Less"
              onClick={() => setAmount((a) => Math.max(step, Math.round((a - step) * 100) / 100))}
              className="h-[52px] w-[52px] rounded-2xl bg-surface text-[26px] font-semibold shadow-soft"
            >
              −
            </button>
            <div aria-live="polite" className="flex-1 text-center">
              <span className="d text-[40px] font-extrabold">{fmtNum(amount)}</span>
              <span className="text-base font-semibold text-muted">
                {" "}
                / {fmtNum(total)}
                {unitLabel}
              </span>
            </div>
            <button
              type="button"
              aria-label="More"
              onClick={() => setAmount((a) => Math.min(total, Math.round((a + step) * 100) / 100))}
              className="h-[52px] w-[52px] rounded-2xl bg-surface text-[26px] font-semibold shadow-soft"
            >
              +
            </button>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fractions.length}, minmax(0, 1fr))` }}>
            {fractions.map((f) => (
              <button
                key={f.label}
                type="button"
                aria-pressed={Math.abs(amount - f.v) < 0.01}
                onClick={() => setAmount(Math.round(f.v * 100) / 100)}
                className="chip h-12"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-line py-1.5 pl-4 pr-1.5">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold">
            <CalendarDays size={20} strokeWidth={1.9} className="text-muted" aria-hidden />
            {day === todayISO() ? `Today, ${fmtDay(day)}` : fmtDay(day)}
          </span>
          {pickDate ? (
            <input
              type="date"
              aria-label="Date"
              max={todayISO()}
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="h-10 rounded-xl border border-line px-2 text-[16px]"
            />
          ) : (
            <button type="button" onClick={() => setPickDate(true)} className="h-10 rounded-xl px-3 text-[15px] font-bold text-primary">
              Change
            </button>
          )}
        </div>

        {err && <p className="text-sm text-danger-ink">{err}</p>}

        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy || amount <= 0} onClick={submit} className="btn-primary h-14 rounded-[18px] text-[17px] shadow-glow">
            {busy ? "Saving…" : `Log ${fmtNum(amount)}${unitLabel || " count"} ${tossed ? "tossed" : "used"}`}
          </button>
          <div className="text-center text-[13px] text-muted">
            {left > 0.001 ? `${fmtNum(left)}${unitLabel || " count"} stays in this package` : "Package leaves your kitchen · Undo for 10 sec"}
          </div>
        </div>
      </section>
    </div>
  );
}
