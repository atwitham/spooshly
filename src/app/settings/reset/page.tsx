"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { buildCsv, cutoffInstant, eraseUsageThrough, resetEverything } from "@/lib/db";
import { downloadCsv } from "@/lib/download";
import { eventTime } from "@/lib/types";
import { addDaysISO, fmtDay, todayISO } from "@/lib/dates";
import { FullScreen, centerOnFocus } from "@/components/ui";

type Mode = "usage" | "all";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { householdId, user } = useAuth();
  const k = useKitchen();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "all" ? "all" : "usage");
  const [cutoff, setCutoff] = useState(addDaysISO(todayISO(), -30));
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = todayISO();
  // Inclusive cutoff: everything up to the end of the chosen day.
  const { erase, keep } = useMemo(() => {
    const limit = cutoff ? new Date(cutoffInstant(cutoff)).getTime() : -Infinity;
    const e = k.events.filter((x) => new Date(eventTime(x)).getTime() <= limit).length;
    return { erase: e, keep: k.events.length - e };
  }, [cutoff, k.events]);

  const usage = mode === "usage";
  const ok = typed.trim().toUpperCase() === "RESET" && (!usage || erase > 0) && !busy;
  const when = cutoff ? fmtDay(cutoff) : "";
  const pct = k.events.length ? Math.round((erase / k.events.length) * 100) : 0;
  const quick = [
    { label: "1 wk", v: addDaysISO(today, -7) },
    { label: "2 wks", v: addDaysISO(today, -14) },
    { label: "1 mo", v: addDaysISO(today, -30) },
    { label: "3 mo", v: addDaysISO(today, -91) },
  ];

  async function run() {
    if (!ok || !householdId) return;
    setBusy(true);
    setErr(null);
    try {
      if (usage) await eraseUsageThrough(householdId, cutoff, erase, user?.id ?? null);
      else await resetEverything(householdId, user?.id ?? null);
      await k.reload();
      k.toast(usage ? `Erased ${erase} use${erase === 1 ? "" : "s"}. Insights recalculated.` : "Everything was reset.");
      router.replace("/settings");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t reset.");
      setBusy(false);
    }
  }

  const header = (
    <header className="flex items-center gap-3 px-5 pb-1.5 pt-4">
      <Link href="/settings" aria-label="Back to settings" className="btn-ghost h-11 w-11">
        <ArrowLeft size={22} strokeWidth={1.9} aria-hidden />
      </Link>
      <h1 className="d m-0 text-[26px] font-extrabold">Reset data</h1>
    </header>
  );

  const footer = (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={!ok}
        onClick={run}
        className={`h-14 rounded-[18px] text-[17px] font-bold ${ok ? "bg-danger text-white shadow-[0_8px_20px_rgba(180,35,24,.3)]" : "cursor-not-allowed bg-line text-muted"}`}
      >
        {busy ? "Working…" : usage ? `Erase through ${when}` : "Reset everything"}
      </button>
      <Link href="/settings" className="flex h-[46px] items-center justify-center text-base font-bold text-ink">
        Cancel
      </Link>
    </div>
  );

  return (
    <FullScreen header={header} footer={footer}>
      <div className="flex flex-col gap-4 px-5 py-3.5">
        <div role="radiogroup" aria-label="What to reset" className="flex flex-col gap-2.5">
          {(
            [
              { id: "usage", title: "Usage history up to a date", desc: `Erases older logs only. Recent usage and your ${k.packages.length} items stay.` },
              { id: "all", title: "Everything", desc: "Items, products, history, shopping list. Fresh start." },
            ] as { id: Mode; title: string; desc: string }[]
          ).map((o) => {
            const on = mode === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(o.id)}
                className={`flex w-full items-start gap-3.5 rounded-[20px] border-2 bg-surface p-4 text-left shadow-card ${on ? "border-danger" : "border-transparent"}`}
              >
                <span className="mt-px h-[22px] w-[22px] flex-none rounded-full" style={{ border: on ? "7px solid #B42318" : "2px solid #9AA79F" }} aria-hidden />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-base font-bold">{o.title}</span>
                  <span className="text-[13px] text-muted">{o.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        {usage && (
          <div className="card flex flex-col gap-3 p-4">
            <label htmlFor="cutoff" className="lbl">
              Erase usage on or before
            </label>
            <input id="cutoff" className="fld" type="date" max={today} value={cutoff} onChange={(e) => setCutoff(e.target.value)} onFocus={centerOnFocus} />
            <div role="group" aria-label="Quick dates" className="grid grid-cols-4 gap-1.5">
              {quick.map((q) => (
                <button key={q.label} type="button" aria-pressed={cutoff === q.v} onClick={() => setCutoff(q.v)} className="chip h-11 !rounded-xl !text-[13px]">
                  {q.label} ago
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex h-3 gap-[3px]" aria-hidden>
                {pct > 0 && <span className="block rounded-md bg-[#EF4444]" style={{ width: `${pct}%` }} />}
                {pct < 100 && <span className="flex-1 rounded-md bg-bar" />}
              </div>
              <div className="flex justify-between text-[13px] font-bold">
                <span className="text-danger-ink">
                  {erase} use{erase === 1 ? "" : "s"} erased
                </span>
                <span className="text-primary">
                  {keep} use{keep === 1 ? "" : "s"} kept
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-[18px] bg-danger-tint px-4 py-3.5 text-sm leading-[1.45] text-[#5C1A14]">
          <AlertTriangle size={20} strokeWidth={1.9} className="mt-px flex-none text-danger" aria-hidden />
          <span>
            <strong className="text-[#7A140C]">Can’t be undone.</strong>{" "}
            {usage
              ? erase > 0
                ? `${erase} use${erase === 1 ? "" : "s"} from ${when} and earlier will be erased. ${keep} newer use${keep === 1 ? "" : "s"} stay and Insights recalculate.`
                : `Nothing is logged on or before ${when}. Pick a later date.`
              : `${k.packages.length} items, ${k.events.length} logged uses, ${k.list.length} list items and your product names will be erased.`}
          </span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="lbl">Type RESET to confirm</span>
          <input
            className="fld tracking-[3px]"
            type="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="RESET"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onFocus={centerOnFocus}
          />
        </label>
        {err && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {err}
          </p>
        )}

        <button type="button" onClick={() => downloadCsv(buildCsv(k))} className="self-center text-[15px] font-bold text-primary">
          Export CSV first
        </button>
      </div>
    </FullScreen>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
