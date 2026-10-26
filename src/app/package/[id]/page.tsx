"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { deletePackage, editPackage, ensureProduct, fetchActivity } from "@/lib/db";
import { type ActivityEntry, type InventoryItem, type Product, type Unit, UNITS } from "@/lib/types";
import { fmtNum, formatStored, unitKind } from "@/lib/units";
import { daysUntil, fmtDay, todayISO } from "@/lib/dates";
import { CategoryTile, ChoiceChips, FullScreen, Spinner, centerOnFocus, enterToNext } from "@/components/ui";
import ProductCombobox from "@/components/ProductCombobox";

type Storage = "freezer" | "fridge" | "pantry";

function historyLine(pkg: InventoryItem, entries: ActivityEntry[]) {
  const parts: string[] = [];
  const via = pkg.source && pkg.source !== "manual" ? ` via ${pkg.source.replace("_", " ")}` : "";
  parts.push(`Added ${fmtDay(pkg.added_at ?? pkg.created_at)}${via}`);
  entries
    .filter((e) => e.type === "edit" || e.type === "use" || e.type === "toss")
    .slice(0, 4)
    .reverse()
    .forEach((e) => {
      const verb = e.type === "edit" ? "Edited" : e.type === "use" ? "Used some" : "Tossed some";
      parts.push(`${verb} ${fmtDay(e.at)}${e.type === "edit" && e.summary ? ` (${e.summary})` : ""}`);
    });
  return parts.join(" · ");
}

function EditForm({ pkg }: { pkg: InventoryItem }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user, householdId } = useAuth();
  const k = useKitchen();
  const original = k.productById(pkg.product_id);
  const [product, setProduct] = useState<Product | undefined>(original);
  const [changing, setChanging] = useState(false);
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState(fmtNum(pkg.quantity));
  const [unit, setUnit] = useState<Unit>(pkg.unit);
  const [expires, setExpires] = useState(pkg.expiration_date ?? "");
  const [addedAt, setAddedAt] = useState(pkg.added_at ?? pkg.created_at.slice(0, 10));
  const [storage, setStorage] = useState<Storage | "">(pkg.storage ?? "");
  const [confirm, setConfirm] = useState(params.get("delete") === "1");
  const [history, setHistory] = useState<ActivityEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (householdId) fetchActivity(householdId, { packageId: pkg.id, limit: 20 }).then(setHistory).catch(() => {});
  }, [householdId, pkg.id]);
  useEffect(() => {
    if (confirm) setTimeout(() => confirmRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 100);
  }, [confirm]);

  const qty = Number(amount.replace(",", "."));
  const expired = (daysUntil(expires || null) ?? 0) < 0;

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!product || !(qty > 0)) {
      setErr("Amount needs to be more than 0.");
      return;
    }
    setBusy(true);
    try {
      await editPackage(
        pkg,
        { quantity: qty, unit, expiration_date: expires || null, added_at: addedAt, storage: storage || null, product },
        user?.id ?? null
      );
      await k.reload();
      k.toast("Package saved");
      router.back();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn’t save.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deletePackage(pkg, product, user?.id ?? null);
      router.replace(`/category/${pkg.category}`);
      k.toast(`Deleted ${formatStored(pkg.quantity, pkg.unit)} entry`);
      await k.reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn’t delete.");
      setBusy(false);
    }
  }

  async function createProduct() {
    if (!householdId || !query.trim()) return;
    const p = await ensureProduct(householdId, query.trim(), product?.category ?? pkg.category, unit);
    await k.reload();
    setProduct(p);
    setChanging(false);
  }

  const header = (
    <header className="flex items-center justify-between px-4 py-3.5">
      <button type="button" onClick={() => router.back()} className="btn-ghost h-11 px-3.5 text-[15px]">
        Cancel
      </button>
      <h1 className="d m-0 text-[19px] font-extrabold">Edit package</h1>
      <button type="button" onClick={() => save()} disabled={busy} className="btn-primary h-11 rounded-[14px] px-[18px] text-[15px]">
        Save
      </button>
    </header>
  );

  return (
    <FullScreen header={header}>
      <form onSubmit={save} className="flex flex-col gap-[18px] px-5 pb-8 pt-2" noValidate>
        <div className="card flex items-center gap-3.5 p-3.5">
          {product && <CategoryTile category={product.category} size={48} radius={16} />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="lbl">Product</span>
            <span className="d text-lg font-bold">{product?.name ?? pkg.name}</span>
          </span>
          <button
            type="button"
            onClick={() => (setChanging((c) => !c), setQuery(""))}
            aria-expanded={changing}
            className="h-11 rounded-xl bg-primary-tint px-3 text-sm font-bold text-primary-tint-ink"
          >
            {changing ? "Keep" : "Change"}
          </button>
        </div>
        {changing && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="move-to" className="lbl">
              Move this package to
            </label>
            <ProductCombobox
              id="move-to"
              value={query}
              onChange={setQuery}
              onPick={(p) => {
                setProduct(p);
                setChanging(false);
                if (unitKind(unit) !== p.unit_kind) setUnit(p.display_unit);
              }}
              onCreate={createProduct}
              chosenId={null}
              placeholder="Type a product name"
              autoFocus
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Amount</span>
            <input
              className="fld"
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              onFocus={centerOnFocus}
              onKeyDown={enterToNext}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Unit</span>
            <select className="fld" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.filter((u) => !product || unitKind(u) === product.unit_kind).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Expires</span>
            <input className={`fld ${expired ? "!text-danger-ink" : ""}`} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} onFocus={centerOnFocus} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Date added</span>
            <input className="fld" type="date" max={todayISO()} value={addedAt} onChange={(e) => e.target.value && setAddedAt(e.target.value)} onFocus={centerOnFocus} />
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="lbl">Storage</span>
          <ChoiceChips<Storage | "">
            label="Storage"
            value={storage}
            onChange={(v) => setStorage(v === storage ? "" : v)}
            options={[
              { value: "freezer", label: "Freezer" },
              { value: "fridge", label: "Fridge" },
              { value: "pantry", label: "Pantry" },
            ]}
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-2xl bg-soft px-3.5 py-3 text-[13px] leading-[1.45] text-[#3E4F45]">
          <Clock size={20} strokeWidth={1.9} className="mt-px flex-none" aria-hidden />
          <span>{historyLine(pkg, history)}</span>
        </div>

        {err && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {err}
          </p>
        )}

        {confirm ? (
          <div ref={confirmRef} role="alertdialog" aria-labelledby="del-h" aria-describedby="del-d" className="flex flex-col gap-3 rounded-[20px] bg-danger-tint p-4">
            <div id="del-h" className="d text-lg font-extrabold text-[#7A140C]">
              Delete this {formatStored(pkg.quantity, pkg.unit)} package?
            </div>
            <div id="del-d" className="text-sm leading-[1.45] text-[#5C1A14]">
              It’s removed without logging usage. For food that went bad, use Toss instead.
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setConfirm(false)} className="h-[50px] rounded-[14px] bg-surface text-base font-bold text-ink">
                Keep
              </button>
              <button type="button" disabled={busy} onClick={remove} className="h-[50px] rounded-[14px] bg-danger text-base font-bold text-white">
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-danger-tint text-base font-bold text-danger-ink">
            <Trash2 size={20} strokeWidth={1.9} aria-hidden />
            Delete package
          </button>
        )}
        <button type="submit" className="sr-only">
          Save
        </button>
      </form>
    </FullScreen>
  );
}

function EditPackage() {
  const { id } = useParams<{ id: string }>();
  const k = useKitchen();
  const router = useRouter();
  const pkg = useMemo(() => k.packages.find((p) => p.id === id), [k.packages, id]);
  if (!k.ready) return <Spinner />;
  if (!pkg)
    return (
      <div className="mx-auto max-w-md px-5 pt-16 text-center">
        <p className="font-bold">This package isn’t in your kitchen anymore.</p>
        <button type="button" onClick={() => router.replace("/kitchen")} className="mt-3 font-bold text-primary">
          Back to kitchen
        </button>
      </div>
    );
  return <EditForm key={pkg.id} pkg={pkg} />;
}

export default function EditPackagePage() {
  return (
    <Suspense>
      <EditPackage />
    </Suspense>
  );
}
