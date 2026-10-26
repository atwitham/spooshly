"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, House, LayoutGrid, Plus, ShoppingCart } from "lucide-react";

const tabs = [
  { href: "/", label: "Home", Icon: House, match: (p: string) => p === "/" },
  { href: "/kitchen", label: "Kitchen", Icon: LayoutGrid, match: (p: string) => p.startsWith("/kitchen") || p.startsWith("/category") },
  null,
  { href: "/list", label: "List", Icon: ShoppingCart, match: (p: string) => p.startsWith("/list") },
  { href: "/insights", label: "Insights", Icon: BarChart3, match: (p: string) => p.startsWith("/insights") },
];

/**
 * Floating nav. The active tab gets a white label + an 18×4 lime bar —
 * never a filled pill — so it can't be confused with the lime Add circle.
 */
export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3.5 z-30 mx-auto flex h-[68px] max-w-[440px] items-center justify-around rounded-[26px] bg-ink px-1.5 shadow-nav"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
    >
      {tabs.map((t) => {
        if (!t)
          return (
            <Link
              key="add"
              href="/add"
              aria-label="Add item"
              className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-accent text-ink"
              style={{ boxShadow: "0 0 0 5px rgba(199,240,107,.16)" }}
            >
              <Plus size={26} strokeWidth={2.6} aria-hidden />
            </Link>
          );
        const on = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`relative flex h-[52px] w-[58px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] ${
              on ? "font-extrabold text-white" : "font-semibold text-[#A9BDB1]"
            }`}
          >
            <t.Icon size={22} strokeWidth={1.9} aria-hidden />
            {t.label}
            {on && <span aria-hidden className="absolute -bottom-[3px] left-1/2 h-1 w-[18px] -translate-x-1/2 rounded-sm bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}
