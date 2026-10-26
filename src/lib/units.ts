import type { Unit, UnitKind } from "./types";

/**
 * Quantities are stored exactly as entered (amount + unit). Every sum and
 * comparison converts to a base unit first: grams for weight, millilitres for
 * volume, count for count. Display converts back at the last moment.
 */
const TO_BASE: Record<Unit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
  ml: 1,
  l: 1000,
  count: 1,
};

export const OZ = TO_BASE.oz;
export const LB = TO_BASE.lb;

export function unitKind(unit: Unit | string): UnitKind {
  if (unit === "g" || unit === "kg" || unit === "oz" || unit === "lb") return "weight";
  if (unit === "ml" || unit === "l") return "volume";
  return "count";
}

export const toBase = (qty: number, unit: Unit | string) => Number(qty) * (TO_BASE[unit as Unit] ?? 1);
export const fromBase = (base: number, unit: Unit | string) => base / (TO_BASE[unit as Unit] ?? 1);

export function round1(n: number) {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

export function fmtNum(n: number) {
  const r = round1(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "7 oz", "458 oz (28.6 lb)", "1.2 kg", "12 count". */
export function formatQty(
  base: number,
  kind: UnitKind,
  displayUnit: Unit = kind === "weight" ? "oz" : kind === "volume" ? "ml" : "count",
  opts: { withLb?: boolean } = {}
): string {
  if (kind === "count") return `${fmtNum(base)} count`;
  if (kind === "volume") {
    if (displayUnit === "l" || base >= 1000) return `${fmtNum(base / 1000)} l`;
    return `${fmtNum(base)} ml`;
  }
  if (displayUnit === "g" || displayUnit === "kg") {
    return base >= 1000 ? `${fmtNum(base / 1000)} kg` : `${fmtNum(base)} g`;
  }
  const oz = base / OZ;
  if (displayUnit === "lb" && !opts.withLb) return `${fmtNum(base / LB)} lb`;
  if (opts.withLb && oz >= 16) return `${fmtNum(oz)} oz (${fmtNum(base / LB)} lb)`;
  return `${fmtNum(oz)} oz`;
}

/** Large weights read better in lb: "1.5 lb" with an "23.5 oz" sub-line. */
export function formatWeightHeadline(base: number, displayUnit: Unit = "oz") {
  if (displayUnit === "g" || displayUnit === "kg") {
    return { main: formatQty(base, "weight", "g"), sub: `${fmtNum(base)} g` };
  }
  return { main: `${fmtNum(base / LB)} lb`, sub: `${fmtNum(base / OZ)} oz` };
}

/** Format a package's own stored amount, in its own unit. */
export const formatStored = (qty: number, unit: Unit) =>
  unit === "count" ? `${fmtNum(qty)} count` : `${fmtNum(qty)} ${unit}`;
