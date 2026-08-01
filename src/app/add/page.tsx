"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, Camera } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { CATEGORIES, type Category, type Unit } from "@/lib/types";
import { addItem } from "@/lib/inventory";
import { lookupBarcode } from "@/lib/barcodeLookup";
import { uploadItemPhoto, fileToDataUrl } from "@/lib/storage";
import BarcodeScanner from "@/components/BarcodeScanner";

type Mode = "manual" | "barcode" | "photo";

export default function AddPage() {
  const { householdId, user } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("manual");
  const [showScanner, setShowScanner] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("seasoning");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<Unit>("count");
  const [expiration, setExpiration] = useState("");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleBarcodeDetected(code: string) {
    setShowScanner(false);
    setBarcode(code);
    setStatus("Looking up product…");
    const productName = await lookupBarcode(code);
    if (productName) {
      setName(productName);
      setStatus(`Found: ${productName}. Review details below.`);
    } else {
      setStatus("No match found online. Enter the product name manually.");
    }
    setMode("manual");
  }

  async function handlePhotoChosen(file: File) {
    setPhotoFile(file);
    const dataUrl = await fileToDataUrl(file);
    setPhotoPreview(dataUrl);
    setStatus("Identifying item…");
    try {
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        setName(data.name ?? "");
        if (data.category && CATEGORIES.some((c) => c.value === data.category)) {
          setCategory(data.category);
        }
        setStatus("Got it. Review the details below.");
      } else {
        setStatus(data.error ?? "Couldn't identify the photo automatically. Enter details manually.");
      }
    } catch {
      setStatus("Couldn't identify the photo automatically. Enter details manually.");
    }
    setMode("manual");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!householdId || !name.trim()) return;
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (photoFile) {
        photo_url = await uploadItemPhoto(photoFile, householdId);
      }
      await addItem({
        household_id: householdId,
        name: name.trim(),
        category,
        quantity,
        unit,
        expiration_date: expiration || null,
        barcode,
        photo_url,
        added_by: user?.id ?? null,
      });
      router.push(`/category/${category}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight text-deep">Add item</h1>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setShowScanner(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-paper py-2 text-sm font-semibold text-deep"
        >
          <Barcode size={16} /> Scan barcode
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-paper py-2 text-sm font-semibold text-deep"
        >
          <Camera size={16} /> Photo identify
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePhotoChosen(file);
        }}
      />

      {status && <p className="mb-4 rounded-lg bg-mist p-2 text-sm" style={{ color: "#17A45E" }}>{status}</p>}

      {photoPreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoPreview} alt="Preview" className="mb-4 h-32 w-32 rounded-lg object-cover" />
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm item-meta">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Smoked Paprika"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm item-meta">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm item-meta">Amount</label>
            <input
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm item-meta">Unit</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2"
            >
              {["oz", "lb", "g", "kg", "count", "ml", "l"].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm item-meta">Expiration date (optional)</label>
          <input
            type="date"
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !householdId}
          className="w-full rounded-lg py-2.5 font-semibold text-paper disabled:opacity-60"
          style={{ background: "#17A45E" }}
        >
          {saving ? "Saving…" : "Add to inventory"}
        </button>
      </form>

      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
