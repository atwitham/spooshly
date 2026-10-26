"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { AlertTriangle, Barcode, Camera, Check } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { useKitchen } from "@/lib/KitchenProvider";
import { addPackages } from "@/lib/db";
import { lookupBarcode } from "@/lib/barcodeLookup";
import { fileToDataUrl, uploadItemPhoto } from "@/lib/storage";
import { findExact, isSimilar, suggest } from "@/lib/normalize";
import { CATEGORIES, type Category, type Product, type Unit, UNITS, categoryMeta } from "@/lib/types";
import { fmtNum, fromBase, unitKind } from "@/lib/units";
import { addDaysISO, todayISO } from "@/lib/dates";
import { FullScreen, centerOnFocus, enterToNext } from "@/components/ui";
import ProductCombobox from "@/components/ProductCombobox";
import BarcodeScanner from "@/components/BarcodeScanner";

const defaultUnit = (c: Category): Unit => (c === "meat" ? "oz" : "count");

function shelfLifeCopy(product: Product | null, category: Category, days: number | null) {
  if (!days) return null;
  const span = days >= 60 ? `${Math.round(days / 30.4)} months` : days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} days`;
  const what = product ? product.name : categoryMeta(category).label.toLowerCase();
  const learned = product?.default_shelf_life_days ? "your last one" : "a typical shelf life";
  return `${what} defaults to ${span} (${learned}); change it if the label says otherwise.`;
}

function AddForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { householdId, user } = useAuth();
  const k = useKitchen();
  const startCat = (CATEGORIES.some((c) => c.value === params.get("category")) ? params.get("category") : "meat") as Category;

  const [query, setQuery] = useState(params.get("name") ?? "");
  const [chosen, setChosen] = useState<Product | null>(null);
  const [createdNew, setCreatedNew] = useState(false);
  const [category, setCategory] = useState<Category>(startCat);
  const [size, setSize] = useState("");
  const [unit, setUnit] = useState<Unit>(defaultUnit(startCat));
  const [count, setCount] = useState(1);
  const startShelf = categoryMeta(startCat).shelfLifeDays;
  const [expires, setExpires] = useState(startShelf ? addDaysISO(todayISO(), startShelf) : "");
  const [addedAt, setAddedAt] = useState(todayISO());
  const [source, setSource] = useState<"manual" | "barcode" | "photo">("manual");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [scanner, setScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const exact = useMemo(() => findExact(query, k.products), [query, k.products]);
  const similar = useMemo(
    () =>
      exact || !query.trim()
        ? null
        : suggest(query, k.products, () => ({ inStock: 0, lastUsed: 0 }), 1)[0] ?? k.products.find((p) => isSimilar(query, p.name)) ?? null,
    [exact, query, k.products]
  );
  const target = chosen && chosen.name === query ? chosen : exact ?? null;
  const finalName = target ? target.name : query.trim();
  const shelfDays = target?.default_shelf_life_days ?? categoryMeta(category).shelfLifeDays;
  const inStock = target ? k.packages.filter((p) => p.product_id === target.id).length : 0;

  function applyProduct(p: Product) {
    setChosen(p);
    setQuery(p.name);
    setCategory(p.category);
    setUnit(p.display_unit);
    if (p.default_package_size) setSize(fmtNum(fromBase(p.default_package_size, p.display_unit)));
    const days = p.default_shelf_life_days ?? categoryMeta(p.category).shelfLifeDays;
    setExpires(days ? addDaysISO(addedAt, days) : "");
  }

  function changeCategory(c: Category) {
    setCategory(c);
    if (!target) {
      setUnit(defaultUnit(c));
      const days = categoryMeta(c).shelfLifeDays;
      setExpires(days ? addDaysISO(addedAt, days) : "");
    }
  }

  async function onBarcode(code: string) {
    setScanner(false);
    setBarcode(code);
    setSource("barcode");
    setStatus("Looking up product…");
    const name = await lookupBarcode(code);
    if (name) {
      setQuery(name);
      setChosen(null);
      setStatus(`Found ${name}. Check the details below.`);
    } else setStatus("No match online. Type the name below.");
  }

  async function onPhoto(file: File) {
    setPhoto(file);
    setSource("photo");
    const url = await fileToDataUrl(file);
    setPhotoPreview(url);
    setStatus("Identifying…");
    try {
      const res = await fetch("/api/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: url }) });
      const data = await res.json();
      if (res.ok && data.name) {
        const match = findExact(data.name, k.products);
        if (match) applyProduct(match);
        else {
          setQuery(data.name);
          if (data.category && CATEGORIES.some((c) => c.value === data.category)) changeCategory(data.category);
        }
        setStatus("Got it. Check the details below.");
      } else setStatus(data.error ?? "Couldn’t identify the photo. Type the name below.");
    } catch {
      setStatus("Couldn’t identify the photo. Type the name below.");
    }
  }

  const sizeNum = Number(size.replace(",", "."));
  const canSave = !!householdId && !!finalName && sizeNum > 0 && !saving;

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSave) {
      setErr(!finalName ? "Add a name first." : "Add a size first.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const photoUrl = photo ? await uploadItemPhoto(photo, householdId!) : null;
      const res = await addPackages({
        householdId: householdId!,
        userId: user?.id ?? null,
        product: target,
        typedName: query,
        category,
        size: sizeNum,
        unit,
        count,
        expires: expires || null,
        addedAt,
        source,
        barcode,
        photoUrl,
      });
      await k.reload();
      k.toast(`Added ${count} × ${res.product.name}`, res.undo);
      router.replace(`/category/${res.product.category}?open=${res.product.id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn’t save. Try again.");
      setSaving(false);
    }
  }

  const header = (
    <header className="flex items-center justify-between px-4 pb-2 pt-3.5">
      <Link href="/" className="btn-ghost h-11 px-3.5 text-[15px]" onClick={(e) => (e.preventDefault(), router.back())}>
        Cancel
      </Link>
      <h1 className="d m-0 text-[19px] font-extrabold">Add item</h1>
      <button type="button" onClick={() => save()} disabled={saving} className="btn-primary h-11 rounded-[14px] px-[18px] text-[15px]">
        Save
      </button>
    </header>
  );

  const footer = (
    <button type="button" onClick={() => save()} disabled={saving} className="btn-primary h-[54px] w-full truncate rounded-[18px] px-4 text-base shadow-glow">
      {saving ? "Saving…" : finalName ? `Add ${count} × ${finalName}` : "Add item"}
    </button>
  );

  return (
    <FullScreen header={header} footer={footer}>
      <form ref={formRef} onSubmit={save} className="flex flex-col gap-4 px-5 pb-6 pt-2" noValidate>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setScanner(true)} className="flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-bold text-white">
            <Barcode size={20} className="text-accent" aria-hidden />
            Scan barcode
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost h-[50px] gap-2 rounded-2xl text-[15px] font-bold">
            <Camera size={20} aria-hidden />
            Photo
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])}
        />
        {status && <p className="rounded-2xl bg-primary-tint px-3.5 py-2.5 text-sm text-primary-tint-ink">{status}</p>}
        {photoPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoPreview} alt="Your photo" className="h-28 w-28 rounded-2xl object-cover" />
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name-in" className="lbl">
            Name
          </label>
          <ProductCombobox
            id="name-in"
            value={query}
            onChange={(v) => {
              setQuery(v);
              setCreatedNew(false);
              if (chosen && v !== chosen.name) setChosen(null);
            }}
            onPick={applyProduct}
            onCreate={() => setCreatedNew(true)}
            chosenId={chosen?.id ?? (createdNew ? "__new" : null)}
            autoFocus={!params.get("name")}
          />
          {exact && !(chosen && chosen.id === exact.id && chosen.name === query) && (
            <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-primary-tint px-3.5 py-3 text-sm leading-snug text-[#0F3D22]">
              <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-primary text-white">
                <Check size={14} strokeWidth={3} aria-hidden />
              </span>
              <span>
                Already in your kitchen. Saved as <strong>{exact.name}</strong>
                {inStock > 0 ? ` so it stacks with your ${inStock} package${inStock === 1 ? "" : "s"}.` : " so its history stays together."}
              </span>
            </div>
          )}
          {!exact && similar && !createdNew && (
            <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-warn-tint px-3.5 py-3 text-sm leading-snug text-[#5C2A04]">
              <AlertTriangle size={20} strokeWidth={1.9} className="mt-px flex-none text-[#B45309]" aria-hidden />
              <span>
                Similar to <strong>{similar.name}</strong>. Pick it above to avoid a duplicate, or keep going to create a new product.
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cat-in" className="lbl">
            Category
          </label>
          <select id="cat-in" className="fld" value={category} onChange={(e) => changeCategory(e.target.value as Category)} disabled={!!target}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {target && <span className="text-xs text-muted">Set by {target.name}. Change it in Settings › Product names.</span>}
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Size</span>
            <input
              className="fld"
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              placeholder="0"
              value={size}
              onChange={(e) => setSize(e.target.value.replace(/[^0-9.,]/g, ""))}
              onFocus={centerOnFocus}
              onKeyDown={enterToNext}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Unit</span>
            <select className="fld" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.filter((u) => !target || unitKind(u) === target.unit_kind).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="lbl" id="pk-l">
              Packages
            </span>
            <div role="group" aria-labelledby="pk-l" className="flex h-[54px] items-center justify-between rounded-2xl bg-ink px-1 text-white">
              <button type="button" aria-label="Fewer packages" onClick={() => setCount((c) => Math.max(1, c - 1))} className="h-11 w-[34px] text-[22px] text-accent">
                −
              </button>
              <span className="d text-[19px] font-extrabold" aria-live="polite">
                {count}
              </span>
              <button type="button" aria-label="More packages" onClick={() => setCount((c) => Math.min(99, c + 1))} className="h-11 w-[34px] text-[22px] text-accent">
                +
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Expires</span>
            <input className="fld" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} onFocus={centerOnFocus} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Date added</span>
            <input
              className="fld"
              type="date"
              max={todayISO()}
              value={addedAt}
              onChange={(e) => e.target.value && setAddedAt(e.target.value)}
              onFocus={centerOnFocus}
            />
          </label>
        </div>
        {expires && shelfDays && <p className="m-0 text-[13px] text-muted">{shelfLifeCopy(target, category, shelfDays)?.replace(/^./, (c) => c.toUpperCase())}</p>}
        {err && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {err}
          </p>
        )}
        <button type="submit" className="sr-only">
          Save
        </button>
      </form>
      {scanner && <BarcodeScanner onDetected={onBarcode} onClose={() => setScanner(false)} />}
    </FullScreen>
  );
}

export default function AddPage() {
  return (
    <Suspense>
      <AddForm />
    </Suspense>
  );
}
