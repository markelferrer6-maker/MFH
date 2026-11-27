import {
  uid,
  type Exercise,
  type ExerciseType,
  type PlannedSet,
  type Progression,
  type Routine,
  type RoutineExercise,
  type SetValues,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '../db/schema';
import { defaultProgression, suggestNext } from './progression';

const VALUE_KEYS = ['weightKg', 'reps', 'durationSec', 'distanceM'] as const;

export function pickValues(s: SetValues): SetValues {
  const out: SetValues = {};
  for (const k of VALUE_KEYS) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

export function hasValues(s: SetValues): boolean {
  return VALUE_KEYS.some((k) => s[k] !== undefined);
}

/**
 * Series hechas del ejercicio en el entreno terminado más reciente que lo incluye.
 * `before` limita la búsqueda a entrenos anteriores a esa fecha ISO.
 */
export function lastPerformance(workouts: Workout[], exerciseId: string, before?: string): WorkoutSet[] {
  let best: Workout | undefined;
  for (const w of workouts) {
    if (w.status !== 'done') continue;
    if (before !== undefined && w.startedAt >= before) continue;
    if (best && w.startedAt <= best.startedAt) continue;
    if (w.exercises.some((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.done))) best = w;
  }
  if (!best) return [];
  return best.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.done));
}

/**
 * Prepara las series de un ejercicio para un entreno nuevo.
 * Cada serie queda vacía, con la última vez como referencia (`prev`) y un valor
 * sugerido (`hint`): lo de la última vez o, si no hay, lo planificado en la rutina.
 */
export function buildSets(
  planned: PlannedSet[],
  previous: WorkoutSet[],
  progress?: { type: ExerciseType; progression: Progression | null | undefined },
): WorkoutSet[] {
  const count = planned.length > 0 ? planned.length : Math.max(previous.length, 1);
  const out: WorkoutSet[] = [];
  for (let i = 0; i < count; i++) {
    const plan = planned[i];
    const prev = previous[i];
    const set: WorkoutSet = { type: plan?.type ?? prev?.type ?? 'normal', done: false };
    if (prev) {
      set.prev = { ...pickValues(prev), ...(prev.rpe !== undefined ? { rpe: prev.rpe } : {}) };
    }
    const type = plan?.type ?? prev?.type ?? 'normal';
    const fromPrev =
      prev && hasValues(prev)
        ? progress?.progression && type !== 'warmup'
          ? suggestNext(pickValues(prev), progress.progression, progress.type)
          : pickValues(prev)
        : undefined;
    const hint = fromPrev ?? (plan ? pickValues(plan) : {});
    if (hasValues(hint)) set.hint = hint;
    out.push(set);
  }
  return out;
}

export function buildExercise(
  slot: Pick<RoutineExercise, 'exerciseId' | 'notes' | 'restSeconds' | 'supersetId' | 'progression'>,
  planned: PlannedSet[],
  history: Workout[],
  /** Tipo del ejercicio y si se aplica la progresión automática. Sin esto no hay progresión. */
  opts?: { type: ExerciseType; auto: boolean },
): WorkoutExercise {
  const previous = lastPerformance(history, slot.exerciseId);
  let progression: Progression | null | undefined = slot.progression;
  if (opts && progression === undefined && opts.auto) progression = defaultProgression(opts.type, planned, previous);
  const ex: WorkoutExercise = {
    exerciseId: slot.exerciseId,
    restSeconds: slot.restSeconds,
    sets: buildSets(planned, previous, opts ? { type: opts.type, progression } : undefined),
  };
  if (progression !== undefined) ex.progression = progression;
  if (slot.notes) ex.notes = slot.notes;
  if (slot.supersetId !== undefined) ex.supersetId = slot.supersetId;
  return ex;
}

export function buildWorkoutFromRoutine(
  routine: Routine,
  history: Workout[],
  now = new Date(),
  /** Con la biblioteca de ejercicios se calculan los objetivos de progresión. */
  opts?: { exercises: Map<string, Exercise>; auto: boolean },
): Workout {
  return {
    id: uid(),
    routineId: routine.id,
    name: routine.name,
    startedAt: now.toISOString(),
    status: 'active',
    exercises: routine.exercises.map((re) => {
      const exercise = opts?.exercises.get(re.exerciseId);
      return buildExercise(re, re.sets, history, exercise ? { type: exercise.type, auto: opts!.auto } : undefined);
    }),
  };
}

export function buildEmptyWorkout(now = new Date()): Workout {
  return { id: uid(), name: 'Entreno libre', startedAt: now.toISOString(), status: 'active', exercises: [] };
}

/** Marca o desmarca una serie. Al marcarla, los campos vacíos se rellenan con el valor sugerido. */
export function toggleSet(set: WorkoutSet, fields: readonly (keyof SetValues)[]): WorkoutSet {
  if (set.done) return { ...set, done: false };
  const next: WorkoutSet = { ...set, done: true };
  for (const k of fields) {
    if (next[k] === undefined && set.hint?.[k] !== undefined) next[k] = set.hint[k];
  }
  return next;
}

/** Serie nueva al final de un ejercicio: copia el tipo y sugiere los valores de la anterior. */
export function nextSet(sets: WorkoutSet[]): WorkoutSet {
  const last = sets[sets.length - 1];
  if (!last) return { type: 'normal', done: false };
  const hint = hasValues(last) ? pickValues(last) : last.hint;
  const set: WorkoutSet = { type: last.type === 'warmup' ? 'normal' : last.type, done: false };
  if (hint && hasValues(hint)) set.hint = hint;
  return set;
}

/**
 * Cierra un entreno: descarta las series sin hacer y los ejercicios que se quedan
 * sin series, y elimina los datos auxiliares (sugerencias y referencia anterior).
 */
export function finishWorkout(w: Workout, now = new Date()): Workout {
  const exercises = w.exercises
    .map((e) => ({
      ...e,
      sets: e.sets
        .filter((s) => s.done)
        .map((s) => {
          const { hint: _hint, prev: _prev, ...rest } = s;
          return rest;
        }),
    }))
    .filter((e) => e.sets.length > 0);
  return { ...w, status: 'done', finishedAt: w.finishedAt ?? now.toISOString(), exercises };
}

export function doneSetCount(w: Workout): number {
  return w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
}

/** Devuelve la rutina con los ejercicios y series tal como se hicieron en el entreno. */
export function routineFromWorkout(routine: Routine, finished: Workout, now = new Date()): Routine {
  return {
    ...routine,
    updatedAt: now.toISOString(),
    exercises: finished.exercises.map((e) => {
      const re: RoutineExercise = {
        exerciseId: e.exerciseId,
        restSeconds: e.restSeconds,
        sets: e.sets.map((s) => ({ type: s.type, ...pickValues(s) })),
      };
      if (e.notes) re.notes = e.notes;
      if (e.supersetId !== undefined) re.supersetId = e.supersetId;
      if (e.progression !== undefined) re.progression = e.progression;
      return re;
    }),
  };
}

/**
 * Guarda en la rutina la progresión que se resolvió al empezar el entreno, para que el
 * rango de repeticiones quede fijo y no cambie cuando cambien las series planificadas.
 * Devuelve la misma rutina si no hay nada que guardar.
 */
export function rememberProgression(routine: Routine, workout: Workout): Routine {
  let changed = false;
  const exercises = routine.exercises.map((re, i) => {
    const we = workout.exercises[i];
    if (re.progression !== undefined || !we || we.exerciseId !== re.exerciseId || !we.progression) return re;
    changed = true;
    return { ...re, progression: we.progression };
  });
  return changed ? { ...routine, exercises } : routine;
}

/** Fecha del último entreno terminado de cada rutina. */
export function lastDoneByRoutine(workouts: Workout[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of workouts) {
    if (w.status !== 'done' || !w.routineId) continue;
    const cur = out.get(w.routineId);
    if (!cur || w.startedAt > cur) out.set(w.routineId, w.startedAt);
  }
  return out;
}

/**
 * Rutina sugerida: la que lleva más tiempo sin hacerse entre las que se han hecho
 * alguna vez en los últimos `windowDays` días. Así una rutina abandonada no se
 * sugiere eternamente. Si ninguna cumple, no hay sugerencia.
 */
export function suggestRoutine(
  routines: Routine[],
  workouts: Workout[],
  now = new Date(),
  windowDays = 14,
): Routine | undefined {
  const last = lastDoneByRoutine(workouts);
  const limit = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const candidates = routines.filter((r) => (last.get(r.id) ?? '') >= limit);
  if (candidates.length < 2) return undefined;
  return candidates.reduce((a, b) => (last.get(a.id)! <= last.get(b.id)! ? a : b));
}

/** Une o separa un ejercicio y el siguiente en una superserie. */
export function toggleSupersetWithNext<T extends { supersetId?: number }>(items: T[], index: number): T[] {
  const a = items[index];
  const b = items[index + 1];
  if (!a || !b) return items;
  const out = items.map((x) => ({ ...x }));
  if (a.supersetId !== undefined && a.supersetId === b.supersetId) {
    // Separar: el siguiente y los que le siguen en el grupo pasan a un grupo nuevo.
    const old = a.supersetId;
    const fresh = Math.max(-1, ...items.map((x) => x.supersetId ?? -1)) + 1;
    for (let i = index + 1; i < out.length && out[i].supersetId === old; i++) out[i].supersetId = fresh;
  } else {
    const id = a.supersetId ?? b.supersetId ?? Math.max(-1, ...items.map((x) => x.supersetId ?? -1)) + 1;
    const oldB = b.supersetId;
    out[index].supersetId = id;
    for (let i = index + 1; i < out.length; i++) {
      if (i === index + 1 || (oldB !== undefined && out[i].supersetId === oldB)) out[i].supersetId = id;
      else break;
    }
  }
  return normalizeSupersets(out);
}

/** Un grupo de un solo ejercicio no es una superserie: se le quita el número. */
export function normalizeSupersets<T extends { supersetId?: number }>(items: T[]): T[] {
  return items.map((x, i) => {
    if (x.supersetId === undefined) return x;
    const linked = items[i - 1]?.supersetId === x.supersetId || items[i + 1]?.supersetId === x.supersetId;
    if (linked) return x;
    const { supersetId: _drop, ...rest } = x;
    return rest as T;
  });
}

/** ¿El entreno terminado tiene otros ejercicios, superseries o series que la rutina? */
export function structureDiffers(routine: Routine, finished: Workout): boolean {
  if (routine.exercises.length !== finished.exercises.length) return true;
  return routine.exercises.some((re, i) => {
    const we = finished.exercises[i];
    return (
      re.exerciseId !== we.exerciseId ||
      re.supersetId !== we.supersetId ||
      re.sets.length !== we.sets.length ||
      re.sets.some((s, j) => s.type !== we.sets[j].type)
    );
  });
}

/**
 * Lleva a la rutina los cambios de progresión hechos durante el entreno (rango, incremento
 * o desactivarla), aunque no se actualice el resto de la rutina.
 * Devuelve la misma rutina si no cambia nada.
 */
export function syncProgression(routine: Routine, finished: Workout): Routine {
  let changed = false;
  const exercises = routine.exercises.map((re) => {
    const we = finished.exercises.find((e) => e.exerciseId === re.exerciseId);
    if (!we || we.progression === undefined) return re;
    if (JSON.stringify(we.progression) === JSON.stringify(re.progression ?? undefined)) return re;
    changed = true;
    return { ...re, progression: we.progression };
  });
  return changed ? { ...routine, exercises } : routine;
}
