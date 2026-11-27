import type { Exercise, Workout, WorkoutSet } from '../db/schema';

/** 1RM estimado con la fórmula de Epley: peso × (1 + reps / 30). */
export function epley(weightKg: number | undefined, reps: number | undefined): number {
  if (!weightKg || !reps || weightKg <= 0 || reps <= 0) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Series que cuentan para estadísticas: hechas y que no son de calentamiento. */
export function countedSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets.filter((s) => s.done && s.type !== 'warmup');
}

export function setVolume(s: WorkoutSet): number {
  return (s.weightKg ?? 0) * (s.reps ?? 0);
}

export function workoutVolume(w: Workout): number {
  return w.exercises.reduce((sum, e) => sum + countedSets(e.sets).reduce((a, s) => a + setVolume(s), 0), 0);
}

export function workoutSetCount(w: Workout): number {
  return w.exercises.reduce((n, e) => n + countedSets(e.sets).length, 0);
}

export function workoutDurationSec(w: Workout): number {
  if (!w.finishedAt) return 0;
  return Math.max(0, Math.round((Date.parse(w.finishedAt) - Date.parse(w.startedAt)) / 1000));
}

export interface SessionStat {
  workoutId: string;
  date: string;
  sets: WorkoutSet[];
  bestWeight: number;
  /** Repeticiones de la serie con más peso (a igual peso, la de más reps). */
  bestWeightReps: number;
  bestE1rm: number;
  volume: number;
  bestReps: number;
  totalReps: number;
  bestDuration: number;
  bestDistance: number;
}

/** Sesiones terminadas en las que aparece el ejercicio, de la más antigua a la más reciente. */
export function exerciseSessions(workouts: Workout[], exerciseId: string): SessionStat[] {
  const out: SessionStat[] = [];
  for (const w of workouts) {
    if (w.status !== 'done') continue;
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => countedSets(e.sets));
    if (sets.length === 0) continue;
    const stat: SessionStat = {
      workoutId: w.id,
      date: w.startedAt,
      sets,
      bestWeight: 0,
      bestWeightReps: 0,
      bestE1rm: 0,
      volume: 0,
      bestReps: 0,
      totalReps: 0,
      bestDuration: 0,
      bestDistance: 0,
    };
    for (const s of sets) {
      const weight = s.weightKg ?? 0;
      const reps = s.reps ?? 0;
      if (weight > stat.bestWeight || (weight === stat.bestWeight && weight > 0 && reps > stat.bestWeightReps)) {
        stat.bestWeight = weight;
        stat.bestWeightReps = reps;
      }
      stat.bestE1rm = Math.max(stat.bestE1rm, epley(s.weightKg, s.reps));
      stat.volume += setVolume(s);
      stat.bestReps = Math.max(stat.bestReps, reps);
      stat.totalReps += reps;
      stat.bestDuration = Math.max(stat.bestDuration, s.durationSec ?? 0);
      stat.bestDistance = Math.max(stat.bestDistance, s.distanceM ?? 0);
    }
    out.push(stat);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type RecordKind = 'weight' | 'e1rm' | 'volume' | 'reps' | 'duration' | 'distance';

export const RECORD_LABELS: Record<RecordKind, string> = {
  weight: 'Peso máximo',
  e1rm: '1RM estimado',
  volume: 'Volumen en una sesión',
  reps: 'Repeticiones en una serie',
  duration: 'Duración',
  distance: 'Distancia',
};

export const RECORD_UNITS: Record<RecordKind, string> = {
  weight: 'kg',
  e1rm: 'kg',
  volume: 'kg',
  reps: 'reps',
  duration: 's',
  distance: 'm',
};

const RECORD_VALUE: Record<RecordKind, (s: SessionStat) => number> = {
  weight: (s) => s.bestWeight,
  e1rm: (s) => s.bestE1rm,
  volume: (s) => s.volume,
  reps: (s) => s.bestReps,
  duration: (s) => s.bestDuration,
  distance: (s) => s.bestDistance,
};

export function metricValue(kind: RecordKind, s: SessionStat): number {
  return RECORD_VALUE[kind](s);
}

/** Qué récords tienen sentido para cada tipo de ejercicio. */
export function recordKindsFor(type: Exercise['type']): RecordKind[] {
  switch (type) {
    case 'weight_reps':
      return ['weight', 'e1rm', 'volume'];
    case 'reps':
      return ['reps'];
    case 'duration':
      return ['duration'];
    case 'distance_duration':
      return ['distance', 'duration'];
  }
}

export interface RecordEntry {
  kind: RecordKind;
  value: number;
  date: string;
  workoutId: string;
}

/** Mejor marca de cada tipo. En caso de empate gana la primera vez que se logró. */
export function exerciseRecords(sessions: SessionStat[], kinds: RecordKind[]): RecordEntry[] {
  const out: RecordEntry[] = [];
  for (const kind of kinds) {
    let best: RecordEntry | undefined;
    for (const s of sessions) {
      const value = RECORD_VALUE[kind](s);
      if (value > 0 && (!best || value > best.value)) {
        best = { kind, value, date: s.date, workoutId: s.workoutId };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

export interface NewRecord {
  exerciseId: string;
  kind: RecordKind;
  value: number;
  previous: number;
}

/**
 * Récords que bate un entreno frente al historial anterior.
 * Un ejercicio sin historial no genera récords: la primera vez no hay nada que batir.
 */
export function detectNewRecords(
  workout: Workout,
  history: Workout[],
  exercises: Map<string, Exercise>,
): NewRecord[] {
  const before = history.filter((w) => w.id !== workout.id && w.status === 'done' && w.startedAt < workout.startedAt);
  const asDone: Workout = { ...workout, status: 'done' };
  const out: NewRecord[] = [];
  const seen = new Set<string>();
  for (const we of workout.exercises) {
    if (seen.has(we.exerciseId)) continue;
    seen.add(we.exerciseId);
    const ex = exercises.get(we.exerciseId);
    if (!ex) continue;
    const prior = exerciseSessions(before, we.exerciseId);
    if (prior.length === 0) continue;
    const [now] = exerciseSessions([asDone], we.exerciseId);
    if (!now) continue;
    for (const kind of recordKindsFor(ex.type)) {
      const previous = Math.max(0, ...prior.map(RECORD_VALUE[kind]));
      const value = RECORD_VALUE[kind](now);
      if (value > previous && previous > 0) out.push({ exerciseId: we.exerciseId, kind, value, previous });
    }
  }
  return out;
}

/** Lunes a las 00:00 (hora local) de la semana de la fecha dada. */
export function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (out.getDay() + 6) % 7; // lunes = 0
  out.setDate(out.getDate() - day);
  return out;
}

export interface WeekCount {
  start: Date;
  count: number;
}

/** Entrenos terminados por semana, de las `weeks` últimas semanas hasta la actual. */
export function weeklyCounts(workouts: Workout[], weeks: number, now = new Date()): WeekCount[] {
  const current = weekStart(now);
  const out: WeekCount[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(current);
    start.setDate(start.getDate() - i * 7);
    out.push({ start, count: 0 });
  }
  const index = new Map(out.map((w, i) => [w.start.getTime(), i]));
  for (const w of workouts) {
    if (w.status !== 'done') continue;
    const i = index.get(weekStart(new Date(w.startedAt)).getTime());
    if (i !== undefined) out[i].count++;
  }
  return out;
}

/* ---------- Estancamiento ---------- */

/**
 * Número de sesiones seguidas, contando desde la última, en las que no se ha superado
 * la mejor marca anterior (1RM estimado con peso; repeticiones en ejercicios sin peso).
 */
export function sessionsWithoutProgress(sessions: SessionStat[], type: Exercise['type']): number {
  const value = type === 'weight_reps' ? RECORD_VALUE.e1rm : type === 'reps' ? RECORD_VALUE.reps : undefined;
  if (!value || sessions.length < 2) return 0;
  let best = 0;
  let streak = 0;
  for (const s of sessions) {
    const v = value(s);
    if (v > best + 1e-9) {
      best = v;
      streak = 0;
    } else {
      streak++;
    }
  }
  return streak;
}

/** A partir de cuántas sesiones sin mejorar se avisa de estancamiento. */
export const STALL_SESSIONS = 3;

/* ---------- Volumen por grupo muscular ---------- */

/** Series de trabajo por grupo muscular en los entrenos terminados entre dos fechas. */
export function muscleSets(
  workouts: Workout[],
  exercises: Map<string, Exercise>,
  from: Date,
  to: Date,
): Map<string, number> {
  const out = new Map<string, number>();
  const a = from.toISOString();
  const b = to.toISOString();
  for (const w of workouts) {
    if (w.status !== 'done') continue;
    const t = new Date(w.startedAt).toISOString();
    if (t < a || t >= b) continue;
    for (const e of w.exercises) {
      const muscle = exercises.get(e.exerciseId)?.muscle;
      if (!muscle) continue;
      const n = countedSets(e.sets).length;
      if (n > 0) out.set(muscle, (out.get(muscle) ?? 0) + n);
    }
  }
  return out;
}

/* ---------- Calendario y racha ---------- */

/** Clave de día en hora local: "2026-11-27". */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DayActivity {
  sets: number;
  workoutIds: string[];
}

/** Actividad por día (hora local) de los entrenos terminados. */
export function activityByDay(workouts: Workout[]): Map<string, DayActivity> {
  const out = new Map<string, DayActivity>();
  for (const w of workouts) {
    if (w.status !== 'done') continue;
    const key = dayKey(new Date(w.startedAt));
    const day = out.get(key) ?? { sets: 0, workoutIds: [] };
    day.sets += workoutSetCount(w);
    day.workoutIds.push(w.id);
    out.set(key, day);
  }
  return out;
}

/**
 * Semanas seguidas con al menos un entreno. La semana en curso cuenta si ya tiene
 * entreno; si todavía no, la racha no se rompe hasta que termine.
 */
export function weekStreak(workouts: Workout[], now = new Date()): number {
  const weeks = new Set<number>();
  for (const w of workouts) if (w.status === 'done') weeks.add(weekStart(new Date(w.startedAt)).getTime());
  const cursor = weekStart(now);
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (weeks.has(weekStart(cursor).getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}
