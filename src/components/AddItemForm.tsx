"use client";

import { useRef, useState } from "react";
import { Barcode, Camera } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { CATEGORIES, type Category, type Unit } from "@/lib/types";
import { addOrMergeItem } from "@/lib/inventory";
import { lookupBarcode } from "@/lib/barcodeLookup";
import { uploadItemPhoto, fileToDataUrl } from "@/lib/storage";
import BarcodeScanner from "@/components/BarcodeScanner";

export default function AddItemForm({
  lockCategory,
  onDone,
}: {
  /** If set, the category is fixed (used by the category-page quick-add popup) and the dropdown is hidden. */
  lockCategory?: Category;
  onDone: (category: Category) => void;
}) {
  const { householdId, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showScanner, setShowScanner] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>(lockCategory ?? "seasoning");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<Unit>("count");
  const [expiration, setExpiration] = useState("");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isMeat = category === "meat";

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
        if (!lockCategory && data.category && CATEGORIES.some((c) => c.value === data.category)) {
          setCategory(data.category);
        }
        setStatus("Got it. Review the details below.");
      } else {
        setStatus(data.error ?? "Couldn't identify the photo automatically. Enter details manually.");
      }
    } catch {
      setStatus("Couldn't identify the photo automatically. Enter details manually.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!householdId || !name.trim()) return;
    if (isMeat && !expiration) return;
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (photoFile) {
        photo_url = await uploadItemPhoto(photoFile, householdId);
      }
      await addOrMergeItem({
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
      onDone(category);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-paper py-2 text-sm font-semibold text-deep"
        >
          <Barcode size={16} /> Scan barcode
        </button>
        <button
          type="button"
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

      {status && (
        <p className="mb-4 rounded-lg bg-mist p-2 text-sm" style={{ color: "#17A45E" }}>
          {status}
        </p>
      )}

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

        {!lockCategory && (
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
        )}

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
          <label className="mb-1 block text-sm item-meta">
            Expiration date {isMeat ? "(required for meat)" : "(optional)"}
          </label>
          <input
            type="date"
            required={isMeat}
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !householdId || (isMeat && !expiration)}
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
