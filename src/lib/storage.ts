import { supabase } from "./supabaseClient";

export async function uploadItemPhoto(file: File | Blob, householdId: string): Promise<string> {
  const ext = file instanceof File ? file.name.split(".").pop() || "jpg" : "jpg";
  const path = `${householdId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("item-photos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
  return data.publicUrl;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
