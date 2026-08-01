"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Plus, ShoppingCart, BarChart3 } from "lucide-react";

const tabs = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/add", label: "Add", Icon: Plus },
  { href: "/list", label: "List", Icon: ShoppingCart },
  { href: "/analytics", label: "Usage", Icon: BarChart3 },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-paper/95 backdrop-blur"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)" }}
    >
      <div className="mx-auto flex max-w-md justify-between px-2">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href;
          const color = active ? "#17A45E" : "#A6A395";
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1 pt-3 text-xs"
              style={{ minHeight: 44 }}
            >
              <Icon size={20} color={color} />
              <span style={{ color, fontWeight: active ? 600 : 400 }}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
