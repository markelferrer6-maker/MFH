/**
 * Convierte un volcado de la API de Hevy (rutinas, entrenos y plantillas de
 * ejercicio) al formato de copia de MFH. Es una función pura: no lee ni escribe
 * nada, para poder probarla y ejecutarla desde scripts/hevy-to-mfh.mjs.
 */
import type {
  Exercise,
  ExerciseType,
  PlannedSet,
  Routine,
  RoutineExercise,
  SetType,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../db/schema';

export interface HevySet {
  index?: number;
  type?: string;
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
}

export interface HevyExercise {
  index?: number;
  title: string;
  exercise_template_id: string;
  notes?: string | null;
  supersets_id?: number | null;
  rest_seconds?: number | null;
  sets: HevySet[];
}

export interface HevyRoutine {
  id: string;
  title: string;
  updated_at?: string;
  exercises: HevyExercise[];
}

export interface HevyWorkout {
  id: string;
  routine_id?: string | null;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  exercises: HevyExercise[];
}

export interface HevyTemplate {
  id: string;
  title: string;
  type: string;
  primary_muscle_group?: string | null;
}

export interface HevyDump {
  routines: HevyRoutine[];
  workouts: HevyWorkout[];
  templates: HevyTemplate[];
}

export interface HevyConversion {
  backup: {
    app: 'mfh';
    version: 1;
    exportedAt: string;
    exercises: Exercise[];
    routines: Routine[];
    workouts: Workout[];
    settings: [];
  };
  /** Avisos sobre datos que no se han podido convertir con certeza. */
  warnings: string[];
}

const MUSCLE_ES: Record<string, string> = {
  abdominals: 'Abdominales',
  abductors: 'Abductores',
  adductors: 'Aductores',
  biceps: 'Bíceps',
  calves: 'Gemelos',
  cardio: 'Cardio',
  chest: 'Pecho',
  forearms: 'Antebrazos',
  full_body: 'Cuerpo completo',
  glutes: 'Glúteos',
  hamstrings: 'Isquios',
  lats: 'Dorsales',
  lower_back: 'Lumbares',
  neck: 'Cuello',
  quadriceps: 'Cuádriceps',
  shoulders: 'Hombros',
  traps: 'Trapecios',
  triceps: 'Tríceps',
  upper_back: 'Espalda alta',
  other: 'Otro',
};

const TYPE_MAP: Record<string, ExerciseType> = {
  weight_reps: 'weight_reps',
  bodyweight_weighted: 'weight_reps',
  reps_only: 'reps',
  duration: 'duration',
  distance_duration: 'distance_duration',
};

const SET_TYPES: SetType[] = ['normal', 'warmup', 'dropset', 'failure'];

const num = (v: number | null | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

const cleanTitle = (t: string): string => t.replace(/\s+/g, ' ').trim();

const byIndex = <T extends { index?: number }>(xs: T[]): T[] =>
  xs.map((x, i) => ({ x, i })).sort((a, b) => (a.x.index ?? a.i) - (b.x.index ?? b.i)).map((p) => p.x);

function plannedSet(s: HevySet): PlannedSet {
  const out: PlannedSet = { type: SET_TYPES.includes(s.type as SetType) ? (s.type as SetType) : 'normal' };
  const weightKg = num(s.weight_kg);
  const reps = num(s.reps);
  const durationSec = num(s.duration_seconds);
  const distanceM = num(s.distance_meters);
  if (weightKg !== undefined) out.weightKg = weightKg;
  if (reps !== undefined) out.reps = reps;
  if (durationSec !== undefined) out.durationSec = durationSec;
  if (distanceM !== undefined) out.distanceM = distanceM;
  return out;
}

/** Un grupo de superserie con un solo ejercicio no es una superserie. */
function dropLonelySupersets<T extends { supersetId?: number }>(items: T[]): T[] {
  return items.map((x, i) => {
    if (x.supersetId === undefined) return x;
    if (items[i - 1]?.supersetId === x.supersetId || items[i + 1]?.supersetId === x.supersetId) return x;
    const { supersetId: _drop, ...rest } = x;
    return rest as T;
  });
}

/** Tipo de ejercicio deducido de las series, para plantillas desconocidas. */
function inferType(sets: HevySet[]): ExerciseType {
  if (sets.some((s) => num(s.distance_meters) !== undefined)) return 'distance_duration';
  if (sets.some((s) => num(s.weight_kg) !== undefined)) return 'weight_reps';
  if (sets.some((s) => num(s.reps) !== undefined)) return 'reps';
  if (sets.some((s) => num(s.duration_seconds) !== undefined)) return 'duration';
  return 'weight_reps';
}

export function convertHevy(dump: HevyDump, opts: { now?: Date; defaultRest?: number } = {}): HevyConversion {
  const warnings: string[] = [];
  const defaultRest = opts.defaultRest ?? 90;
  const templates = new Map(dump.templates.map((t) => [t.id, t]));
  const exerciseId = (templateId: string) => `hevy-${templateId}`;

  // Nombre de cada ejercicio: el título del entreno más reciente (Hevy los da en el
  // idioma de la app); si nunca se ha usado en un entreno, el de la plantilla.
  const workoutsNewestFirst = [...dump.workouts].sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time));
  const names = new Map<string, string>();
  const setsByTemplate = new Map<string, HevySet[]>();
  const collect = (e: HevyExercise) => {
    const list = setsByTemplate.get(e.exercise_template_id) ?? [];
    list.push(...e.sets);
    setsByTemplate.set(e.exercise_template_id, list);
  };
  for (const w of workoutsNewestFirst) {
    for (const e of w.exercises) {
      if (!names.has(e.exercise_template_id)) names.set(e.exercise_template_id, cleanTitle(e.title));
      collect(e);
    }
  }
  for (const r of dump.routines) {
    for (const e of r.exercises) {
      if (!names.has(e.exercise_template_id)) {
        names.set(e.exercise_template_id, cleanTitle(templates.get(e.exercise_template_id)?.title ?? e.title));
      }
      collect(e);
    }
  }

  const exercises: Exercise[] = [...names.entries()]
    .map(([templateId, name]) => {
      const t = templates.get(templateId);
      let type = t ? TYPE_MAP[t.type] : undefined;
      if (!type) {
        type = inferType(setsByTemplate.get(templateId) ?? []);
        warnings.push(
          t
            ? `Tipo de ejercicio «${t.type}» desconocido en «${name}»; se usa «${type}» según sus series.`
            : `Sin plantilla para «${name}» (${templateId}); tipo «${type}» deducido de sus series y músculo «Otro».`,
        );
      }
      const muscle = MUSCLE_ES[t?.primary_muscle_group ?? ''] ?? 'Otro';
      if (t?.primary_muscle_group && !MUSCLE_ES[t.primary_muscle_group]) {
        warnings.push(`Grupo muscular «${t.primary_muscle_group}» desconocido en «${name}»; se guarda como «Otro».`);
      }
      return { id: exerciseId(templateId), name, muscle, type, hevyTemplateId: templateId };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  // Los entrenos de Hevy no guardan el descanso: se toma el de la rutina del entreno
  // y, si no, el de cualquier rutina que tenga ese ejercicio.
  const restByRoutine = new Map<string, Map<string, number>>();
  const restAny = new Map<string, number>();
  for (const r of dump.routines) {
    const m = new Map<string, number>();
    for (const e of r.exercises) {
      const rest = num(e.rest_seconds);
      if (rest === undefined) continue;
      if (!m.has(e.exercise_template_id)) m.set(e.exercise_template_id, rest);
      if (!restAny.has(e.exercise_template_id)) restAny.set(e.exercise_template_id, rest);
    }
    restByRoutine.set(r.id, m);
  }

  const slot = (e: HevyExercise, restSeconds: number) => {
    const out: { exerciseId: string; restSeconds: number; notes?: string; supersetId?: number } = {
      exerciseId: exerciseId(e.exercise_template_id),
      restSeconds,
    };
    if (e.notes && e.notes.trim()) out.notes = e.notes.trim();
    const ss = num(e.supersets_id);
    if (ss !== undefined) out.supersetId = ss;
    return out;
  };

  const lastUsed = new Map<string, number>();
  for (const w of dump.workouts) {
    if (!w.routine_id) continue;
    lastUsed.set(w.routine_id, Math.max(lastUsed.get(w.routine_id) ?? 0, Date.parse(w.start_time)));
  }

  const routines: Routine[] = [...dump.routines]
    .sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0) || a.title.localeCompare(b.title, 'es'))
    .map((r, order) => ({
      id: r.id,
      name: cleanTitle(r.title),
      order,
      updatedAt: r.updated_at ?? new Date(0).toISOString(),
      exercises: dropLonelySupersets(
        byIndex(r.exercises).map(
          (e): RoutineExercise => ({ ...slot(e, num(e.rest_seconds) ?? 0), sets: byIndex(e.sets).map(plannedSet) }),
        ),
      ),
    }));

  const routineIds = new Set(routines.map((r) => r.id));
  const workouts: Workout[] = workoutsNewestFirst.map((w) => {
    const start = Date.parse(w.start_time);
    const end = Date.parse(w.end_time);
    if (Number.isNaN(start) || Number.isNaN(end)) throw new Error(`Fechas no válidas en el entreno ${w.id}.`);
    if (end < start) warnings.push(`El entreno «${w.title}» (${w.start_time}) termina antes de empezar.`);
    const rests = w.routine_id ? restByRoutine.get(w.routine_id) : undefined;
    const out: Workout = {
      id: w.id,
      name: cleanTitle(w.title),
      startedAt: new Date(start).toISOString(),
      finishedAt: new Date(Math.max(start, end)).toISOString(),
      status: 'done',
      exercises: dropLonelySupersets(
        byIndex(w.exercises).map((e): WorkoutExercise => {
          const rest = rests?.get(e.exercise_template_id) ?? restAny.get(e.exercise_template_id) ?? defaultRest;
          return {
            ...slot(e, rest),
            sets: byIndex(e.sets).map((s): WorkoutSet => {
              const set: WorkoutSet = { ...plannedSet(s), done: true };
              const rpe = num(s.rpe);
              if (rpe !== undefined) set.rpe = rpe;
              return set;
            }),
          };
        }),
      ),
    };
    if (w.routine_id && routineIds.has(w.routine_id)) out.routineId = w.routine_id;
    if (w.description && w.description.trim()) out.notes = w.description.trim();
    return out;
  });

  return {
    backup: {
      app: 'mfh',
      version: 1,
      exportedAt: (opts.now ?? new Date()).toISOString(),
      exercises,
      routines,
      workouts,
      settings: [],
    },
    warnings,
  };
}
