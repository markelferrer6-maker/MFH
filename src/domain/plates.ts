import type { PlannedSet } from '../db/schema';

/** Discos habituales en un gimnasio, en kg. */
export const ALL_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const BARS = [20, 15, 10, 7.5];

export interface PlateResult {
  /** Discos de un lado, del más pesado al más ligero. */
  perSide: number[];
  /** Peso total que se consigue (barra + discos de ambos lados). */
  total: number;
  /** Lo que falta para el objetivo; 0 si se consigue exacto. */
  missing: number;
}

/** Qué discos poner en cada lado de la barra para llegar a un peso. */
export function platesPerSide(target: number, bar: number, available: number[] = ALL_PLATES): PlateResult {
  const plates = [...available].filter((p) => p > 0).sort((a, b) => b - a);
  // Se trabaja en gramos para evitar errores de coma flotante con 1,25 y 2,5.
  let remaining = Math.round(((target - bar) / 2) * 1000);
  const perSide: number[] = [];
  for (const p of plates) {
    const grams = Math.round(p * 1000);
    while (remaining >= grams) {
      perSide.push(p);
      remaining -= grams;
    }
  }
  const total = bar + 2 * perSide.reduce((a, b) => a + b, 0);
  return { perSide, total, missing: Math.max(0, Math.round((target - total) * 1000) / 1000) };
}

const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/**
 * Series de calentamiento a partir del peso de la primera serie de trabajo.
 * Es una pauta general (porcentajes crecientes con menos repeticiones), no una regla.
 */
export function warmupSets(workWeight: number, step = 2.5): PlannedSet[] {
  if (!(workWeight > 0)) return [];
  const scheme: [number, number][] =
    workWeight >= 40
      ? [
          [0.4, 8],
          [0.6, 5],
          [0.8, 3],
        ]
      : workWeight >= 20
        ? [
            [0.5, 8],
            [0.75, 4],
          ]
        : [[0.5, 8]];
  const out: PlannedSet[] = [];
  for (const [pct, reps] of scheme) {
    const weightKg = roundTo(workWeight * pct, step);
    if (weightKg <= 0 || weightKg >= workWeight) continue;
    if (out.some((s) => s.weightKg === weightKg)) continue;
    out.push({ type: 'warmup', weightKg, reps });
  }
  return out;
}
