"use client";

import Link from "next/link";
import { CircleUser } from "lucide-react";
import Logo from "./Logo";

export default function Header() {
  return (
    <div className="mx-auto flex max-w-md items-center justify-between border-b border-line px-4 py-3">
      <Logo height={24} />
      <Link href="/account" aria-label="Account" className="text-deep">
        <CircleUser size={22} />
      </Link>
    </div>
  );
}
