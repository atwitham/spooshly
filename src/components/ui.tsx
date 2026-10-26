"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bath, Box, Droplet, FlaskConical, Package as PackageIcon, Sprout } from "lucide-react";
import { type Category, categoryMeta } from "@/lib/types";

/** Meat icon from the design reference (a cut of meat with a bone). */
function MeatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 15c-2-4 1-10 7-10 4 0 7 2.5 7 6 0 4-4 8-9 8-2 0-4-1.5-5-4z" />
      <circle cx="13" cy="10" r="2" />
    </svg>
  );
}

export function CategoryIcon({ category, size = 22 }: { category: Category; size?: number }) {
  const props = { size, strokeWidth: 1.9, "aria-hidden": true } as const;
  switch (category) {
    case "meat":
      return <MeatIcon size={size} />;
    case "seasoning":
      return <FlaskConical {...props} />;
    case "oil":
      return <Droplet {...props} />;
    case "essentials":
      return <Bath {...props} />;
    case "produce":
      return <Sprout {...props} />;
    case "pantry":
      return <PackageIcon {...props} />;
    default:
      return <Box {...props} />;
  }
}

/** Tinted icon tile. The tint follows the item everywhere. */
export function CategoryTile({ category, size = 44, radius = 14, icon = true }: { category: Category; size?: number; radius?: number; icon?: boolean }) {
  const m = categoryMeta(category);
  return (
    <span
      className="flex flex-none items-center justify-center"
      style={{ width: size, height: size, borderRadius: radius, background: m.tint, color: m.ink }}
    >
      {icon && <CategoryIcon category={category} size={Math.round(size / 2)} />}
    </span>
  );
}

/** "Spl" + two eyes + "shly". */
export function Wordmark({ size = 28 }: { size?: number }) {
  const s = size / 28;
  return (
    <Link href="/" aria-label="Splooshly home" className="d flex items-center font-extrabold text-ink no-underline" style={{ fontSize: size }}>
      <span aria-hidden>Spl</span>
      <svg aria-hidden width={38 * s} height={22 * s} viewBox="0 0 38 22" style={{ margin: `${2 * s}px ${1 * s}px 0` }}>
        <circle cx="10" cy="12" r="8" fill="#FFFFFF" stroke="#15803D" strokeWidth="3.2" />
        <circle cx="28" cy="12" r="8" fill="#FFFFFF" stroke="#15803D" strokeWidth="3.2" />
        <circle cx="12" cy="14" r="3" fill="#0E2318" />
        <circle cx="30" cy="14" r="3" fill="#0E2318" />
      </svg>
      <span aria-hidden>shly</span>
    </Link>
  );
}

export function BackButton({ href, label = "Back" }: { href?: string; label?: string }) {
  const router = useRouter();
  const cls = "card flex h-11 w-11 flex-none items-center justify-center !rounded-[14px] text-ink";
  if (href)
    return (
      <Link href={href} aria-label={label} className={cls}>
        <ArrowLeft size={22} strokeWidth={1.9} aria-hidden />
      </Link>
    );
  return (
    <button type="button" aria-label={label} className={cls} onClick={() => router.back()}>
      <ArrowLeft size={22} strokeWidth={1.9} aria-hidden />
    </button>
  );
}

export function StatusChip({ tone, children }: { tone: "warn" | "danger" | "ok"; children: React.ReactNode }) {
  const cls =
    tone === "warn" ? "bg-warn-tint text-warn-ink" : tone === "danger" ? "bg-danger-tint text-danger-ink" : "bg-primary-tint text-primary-tint-ink";
  return <span className={`whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-bold ${cls}`}>{children}</span>;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-2xl bg-track p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-10 rounded-xl text-sm font-bold ${on ? "bg-surface text-ink shadow-[0_1px_3px_rgba(14,35,24,.12)]" : "text-[#4B5A52]"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "h-12",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)} className={`chip ${className}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Full-screen form layout that always matches the *visible* viewport
 * (handoff §7). On iOS the keyboard shrinks window.visualViewport but not
 * the layout viewport, which is what made taps land in the wrong place.
 * Sizing the screen to visualViewport keeps the header Save and the pinned
 * action bar on screen and tappable while the keyboard is open.
 */
export function useVisualViewportBox() {
  const [box, setBox] = useState<{ top: number; height: number | null; kb: number }>({ top: 0, height: null, kb: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setBox({ top: vv.offsetTop, height: vv.height, kb });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}

export function FullScreen({ header, footer, children }: { header: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode }) {
  const { top, height, kb } = useVisualViewportBox();
  return (
    <div
      className="fixed inset-x-0 z-10 mx-auto flex max-w-[560px] flex-col bg-bg"
      style={{ top, height: height ?? "100dvh" }}
    >
      <div className="flex-none" style={{ paddingTop: top === 0 ? "env(safe-area-inset-top)" : 0 }}>
        {header}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && (
        <div className="flex-none bg-bg px-4 pt-2.5" style={{ paddingBottom: kb > 0 ? 10 : "calc(10px + env(safe-area-inset-bottom))" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** On focus, scroll the field to the middle after the keyboard animates in. */
export function centerOnFocus(e: React.FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
}

/** "Done" on the keyboard moves to the next field; the last one submits. */
export function enterToNext(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  const form = (e.currentTarget as HTMLInputElement).form;
  if (!form) return;
  e.preventDefault();
  const fields = Array.from(form.querySelectorAll<HTMLElement>("input:not([type=hidden]),select,textarea")).filter(
    (f) => !(f as HTMLInputElement).disabled
  );
  const i = fields.indexOf(e.currentTarget as HTMLElement);
  if (i >= 0 && i < fields.length - 1) fields[i + 1].focus();
  else form.requestSubmit();
}

export function Spinner() {
  return <p className="px-5 pt-10 text-center text-sm text-muted">Loading…</p>;
}
