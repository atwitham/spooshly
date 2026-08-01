"use client";

import { useRouter } from "next/navigation";
import AddItemForm from "@/components/AddItemForm";

export default function AddPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight text-deep">Add item</h1>
      <AddItemForm onDone={(category) => router.push(`/category/${category}`)} />
    </div>
  );
}
