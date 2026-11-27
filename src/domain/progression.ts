import type { ExerciseType, PlannedSet, Progression, SetValues, WorkoutExercise, WorkoutSet } from '../db/schema';

/**
 * Doble progresión por serie ("dinámica"): cada serie avanza por su cuenta.
 *  - Si la última vez llegaste al tope del rango de repeticiones, hoy sube el peso
 *    y vuelves al mínimo del rango.
 *  - Si no, mismo peso y una repetición más.
 * En ejercicios solo de repeticiones (dominadas, flexiones) el objetivo es una más.
 */

export const INCREMENTS = [1, 1.25, 2, 2.5, 5, 10];
export const DEFAULT_INCREMENT = 2.5;
/** Anchura del rango por defecto: de las repeticiones planificadas a dos más. */
export const DEFAULT_RANGE = 2;

export const supportsProgression = (type: ExerciseType): boolean => type === 'weight_reps' || type === 'reps';

/**
 * Rango por defecto para un ejercicio: el mínimo son las repeticiones más bajas de las
 * series de trabajo planificadas (o, si no hay plan, de la última vez).
 */
export function defaultProgression(
  type: ExerciseType,
  planned: PlannedSet[],
  previous: PlannedSet[] = [],
): Progression | undefined {
  if (!supportsProgression(type)) return undefined;
  const reps = (sets: PlannedSet[]) => sets.filter((s) => s.type !== 'warmup' && s.reps).map((s) => s.reps!);
  const source = reps(planned).length > 0 ? reps(planned) : reps(previous);
  if (source.length === 0) return undefined;
  const repMin = Math.min(...source);
  return { repMin, repMax: repMin + DEFAULT_RANGE, increment: DEFAULT_INCREMENT };
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** Objetivo de hoy para una serie, a partir de lo que se hizo la última vez. */
export function suggestNext(prev: SetValues, p: Progression, type: ExerciseType): SetValues {
  if (type === 'reps') return prev.reps === undefined ? {} : { reps: prev.reps + 1 };
  if (type !== 'weight_reps' || prev.weightKg === undefined || prev.reps === undefined) {
    const { weightKg, reps, durationSec, distanceM } = prev;
    const same: SetValues = {};
    if (weightKg !== undefined) same.weightKg = weightKg;
    if (reps !== undefined) same.reps = reps;
    if (durationSec !== undefined) same.durationSec = durationSec;
    if (distanceM !== undefined) same.distanceM = distanceM;
    return same;
  }
  if (prev.reps >= p.repMax) return { weightKg: round(prev.weightKg + p.increment), reps: p.repMin };
  return { weightKg: prev.weightKg, reps: prev.reps + 1 };
}

/** Recalcula las sugerencias de las series aún sin hacer, tras cambiar la progresión. */
export function applyProgression(item: WorkoutExercise, type: ExerciseType): WorkoutExercise {
  const p = item.progression;
  return {
    ...item,
    sets: item.sets.map((s): WorkoutSet => {
      if (s.done || !s.prev) return s;
      const { rpe: _rpe, ...prev } = s.prev;
      const hint = p && s.type !== 'warmup' ? suggestNext(prev, p, type) : prev;
      return { ...s, hint };
    }),
  };
}

export interface ProgressionSummary {
  /** Series en las que hoy toca más peso que la última vez. */
  moreWeight: number;
  /** Series en las que hoy toca alguna repetición más con el mismo peso. */
  moreReps: number;
}

export function progressionSummary(sets: WorkoutSet[]): ProgressionSummary {
  let moreWeight = 0;
  let moreReps = 0;
  for (const s of sets) {
    if (s.type === 'warmup' || !s.prev || !s.hint) continue;
    const pw = s.prev.weightKg ?? 0;
    const hw = s.hint.weightKg ?? 0;
    if (hw > pw) moreWeight++;
    else if (hw === pw && (s.hint.reps ?? 0) > (s.prev.reps ?? 0)) moreReps++;
  }
  return { moreWeight, moreReps };
}

export function progressionLabel(p: Progression | null | undefined, type: ExerciseType): string {
  if (!p) return 'Sin progresión';
  if (type === 'reps') return '+1 rep cada vez';
  return `${p.repMin}–${p.repMax} reps · +${String(p.increment).replace('.', ',')} kg`;
}
