/**
 * Canonical product names (handoff §6.1). Shared by Add, Edit › Change,
 * the shopping-list input, the migration linker and the merge tool.
 */
export function singular(w: string) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y"; // berries → berry
  if (w.length > 4 && /(ches|shes|xes|oes|sses)$/.test(w)) return w.slice(0, -2); // tomatoes → tomato
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1); // breasts → breast
  return w;
}

export const tokens = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular);

export const normalizedKey = (s: string) => tokens(s).join(" ");

export interface Nameable {
  id: string;
  name: string;
  normalized_key: string;
  aliases: string[];
}

/** Exact match on the canonical key or any alias. */
export function findExact<T extends Nameable>(input: string, products: T[]): T | undefined {
  const key = normalizedKey(input);
  if (!key) return undefined;
  return products.find(
    (p) => p.normalized_key === key || p.aliases.some((a) => normalizedKey(a) === key)
  );
}

function tokenMatch(q: string[], t: string[]) {
  return q.every((w) => t.some((x) => x.startsWith(w) || (w.startsWith(x) && x.length > 3)));
}

export function matchesQuery(query: string, p: Nameable) {
  const q = tokens(query);
  if (q.length === 0) return false;
  if (tokenMatch(q, tokens(p.name))) return true;
  return p.aliases.some((a) => tokenMatch(q, tokens(a)));
}

/**
 * Suggestions while typing: top N, ranked by exact match, then most
 * packages in stock, then most recently used.
 */
export function suggest<T extends Nameable>(
  query: string,
  products: T[],
  stats: (p: T) => { inStock: number; lastUsed: number },
  limit = 4
): T[] {
  const exact = findExact(query, products);
  return products
    .filter((p) => matchesQuery(query, p))
    .sort((a, b) => {
      if (exact) {
        if (a.id === exact.id) return -1;
        if (b.id === exact.id) return 1;
      }
      const sa = stats(a);
      const sb = stats(b);
      if (sb.inStock !== sa.inStock) return sb.inStock - sa.inStock;
      return sb.lastUsed - sa.lastUsed;
    })
    .slice(0, limit);
}

/** Token overlap ≥ 50%, or one token set contains the other ("shrimp" ⊂ "raw shrimp"). */
export function isSimilar(a: string, b: string) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const inter = Array.from(ta).filter((x) => tb.has(x)).length;
  if (inter === ta.size || inter === tb.size) return true;
  return inter / Math.max(ta.size, tb.size) >= 0.5;
}

/** Suspected duplicate pairs for the merge tool. */
export function duplicatePairs<T extends Nameable & { category: string }>(products: T[]) {
  const pairs: [T, T][] = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i];
      const b = products[j];
      if (a.category !== b.category) continue;
      if (isSimilar(a.name, b.name)) pairs.push([a, b]);
    }
  }
  return pairs;
}

/**
 * Pick the display name for a group of naming variants: prefer the variant
 * that's already singular ("Boneless Chicken Breast" over "…Breasts"), then
 * the most common spelling.
 */
export function pickDisplayName(names: string[]) {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n.trim(), (counts.get(n.trim()) ?? 0) + 1);
  const isSingularForm = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).join(" ") === normalizedKey(n);
  return Array.from(counts.entries()).sort((a, b) => {
    const sa = isSingularForm(a[0]) ? 1 : 0;
    const sb = isSingularForm(b[0]) ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return b[1] - a[1];
  })[0][0];
}
