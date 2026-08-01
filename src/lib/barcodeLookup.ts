/**
 * Free, keyless barcode -> product name lookup using Open Food Facts.
 * Works well for packaged food, oils, and most seasoning brands.
 * If nothing is found, the caller falls back to manual entry.
 */
export async function lookupBarcode(barcode: string): Promise<string | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1) return null;
    return data.product?.product_name || data.product?.generic_name || null;
  } catch {
    return null;
  }
}
