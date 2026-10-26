"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { type KitchenData, linkUnlinkedRows, loadKitchen, schemaMissing } from "./db";
import type { Ctx } from "./insights";
import { type HouseholdSettings, type Product, DEFAULT_SETTINGS } from "./types";

interface Toast {
  id: number;
  message: string;
  undo?: () => Promise<void>;
}

interface KitchenValue extends KitchenData {
  ready: boolean;
  error: string | null;
  needsMigration: boolean;
  reload: () => Promise<void>;
  ctx: Ctx;
  productById: (id: string | null | undefined) => Product | undefined;
  toast: (message: string, undo?: () => Promise<void>) => void;
  dismissed: Record<string, string>;
  dismiss: (productId: string, signature: string) => void;
}

const empty: KitchenData = {
  products: [],
  packages: [],
  events: [],
  list: [],
  settings: { household_id: "", ...DEFAULT_SETTINGS } as HouseholdSettings,
};

const KitchenContext = createContext<KitchenValue | null>(null);

export function KitchenProvider({ children }: { children: React.ReactNode }) {
  const { householdId } = useAuth();
  const [data, setData] = useState<KitchenData>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [toastState, setToast] = useState<Toast | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const linked = useRef(false);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem("splooshly:dismissed") ?? "{}"));
    } catch {
      /* private mode etc. */
    }
  }, []);

  const reload = useCallback(async () => {
    if (!householdId) return;
    try {
      let d = await loadKitchen(householdId);
      if (!linked.current) {
        linked.current = true;
        if (await linkUnlinkedRows(householdId, d)) d = await loadKitchen(householdId);
      }
      setData(d);
      setError(null);
    } catch (e) {
      if (await schemaMissing()) setNeedsMigration(true);
      else setError(e instanceof Error ? e.message : "Couldn't load your kitchen.");
    } finally {
      setReady(true);
    }
  }, [householdId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Refresh when the app comes back to the foreground (the other phone may have changed things).
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  const toast = useCallback((message: string, undo?: () => Promise<void>) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, undo });
    timer.current = setTimeout(() => setToast(null), undo ? 10000 : 5000);
  }, []);

  const dismiss = useCallback((productId: string, signature: string) => {
    setDismissed((prev) => {
      const next = { ...prev, [productId]: signature };
      try {
        localStorage.setItem("splooshly:dismissed", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<KitchenValue>(() => {
    const byId = new Map(data.products.map((p) => [p.id, p]));
    return {
      ...data,
      ready,
      error,
      needsMigration,
      reload,
      ctx: { products: data.products, packages: data.packages, events: data.events, settings: data.settings },
      productById: (id) => (id ? byId.get(id) : undefined),
      toast,
      dismissed,
      dismiss,
    };
  }, [data, ready, error, needsMigration, reload, toast, dismissed, dismiss]);

  return (
    <KitchenContext.Provider value={value}>
      {children}
      {toastState && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 z-[60] mx-auto flex max-w-md items-center gap-2.5 rounded-[18px] bg-ink px-4 py-3.5 text-[15px] text-white shadow-toast"
          style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-accent text-ink">
            <Check size={16} strokeWidth={3} aria-hidden />
          </span>
          <span className="flex-1">{toastState.message}</span>
          {toastState.undo && (
            <button
              type="button"
              className="h-9 px-2 text-[15px] font-bold text-accent"
              onClick={async () => {
                const undo = toastState.undo!;
                setToast(null);
                try {
                  await undo();
                } finally {
                  await reload();
                }
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </KitchenContext.Provider>
  );
}

export function useKitchen() {
  const v = useContext(KitchenContext);
  if (!v) throw new Error("useKitchen must be used inside KitchenProvider");
  return v;
}
