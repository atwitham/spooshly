"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/types";
import { Spinner } from "@/components/ui";

/** The Kitchen tab opens the last category you browsed (Meat & Frozen by default). */
export default function KitchenPage() {
  const router = useRouter();
  useEffect(() => {
    let last = "meat";
    try {
      const saved = localStorage.getItem("splooshly:lastCategory");
      if (saved && CATEGORIES.some((c) => c.value === saved)) last = saved;
    } catch {
      /* ignore */
    }
    router.replace(`/category/${last}`);
  }, [router]);
  return <Spinner />;
}
