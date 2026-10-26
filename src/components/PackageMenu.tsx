"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Copy, MoreHorizontal, Pencil, Trash2, Trash } from "lucide-react";

/** The ⋯ menu on a package row: Edit, Duplicate, Toss, Delete. */
export default function PackageMenu({
  label,
  editHref,
  onDuplicate,
  onToss,
}: {
  label: string;
  editHref: string;
  onDuplicate: () => void;
  onToss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = "flex h-[46px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold text-ink hover:bg-chip";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`More actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${open ? "bg-ink text-white" : "bg-chip text-ink"}`}
      >
        <MoreHorizontal size={20} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Package actions" className="absolute right-0 top-12 z-40 flex w-[232px] flex-col rounded-[18px] bg-surface p-1.5 shadow-menu">
          <Link role="menuitem" href={editHref} className={item}>
            <Pencil size={20} strokeWidth={1.9} aria-hidden />
            Edit package
          </Link>
          <button role="menuitem" type="button" className={item} onClick={() => (setOpen(false), onDuplicate())}>
            <Copy size={20} strokeWidth={1.9} aria-hidden />
            Duplicate
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => (setOpen(false), onToss())}>
            <Trash size={20} strokeWidth={1.9} aria-hidden />
            Toss (log as waste)
          </button>
          <div className="mx-2 my-1 h-px bg-divider" />
          <Link role="menuitem" href={`${editHref}?delete=1`} className={`${item} !text-danger-ink`}>
            <Trash2 size={20} strokeWidth={1.9} aria-hidden />
            Delete entry
          </Link>
        </div>
      )}
    </div>
  );
}
