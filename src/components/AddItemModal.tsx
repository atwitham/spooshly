"use client";

import { X } from "lucide-react";
import type { Category } from "@/lib/types";
import AddItemForm from "./AddItemForm";

export default function AddItemModal({
  category,
  onClose,
  onAdded,
}: {
  category: Category;
  onClose: () => void;
  onAdded: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-paper p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-deep">Add item</h2>
          <button onClick={onClose} aria-label="Close" className="text-deep">
            <X size={20} />
          </button>
        </div>
        <AddItemForm
          lockCategory={category}
          onDone={() => {
            onAdded();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
