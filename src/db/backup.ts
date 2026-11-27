import type { MfhDB } from './db';
import type {
  Exercise,
  ExerciseType,
  PlannedSet,
  Routine,
  RoutineExercise,
  SetType,
  Setting,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from './schema';

export interface Backup {
  app: 'mfh';
  version: 1;
  exportedAt: string;
  exercises: Exercise[];
  routines: Routine[];
  workouts: Workout[];
  settings: Setting[];
}

export interface ImportResult {
  exercises: number;
  routines: number;
  workouts: number;
}

/** Ajustes que describen este dispositivo y no deben viajar en una copia. */
const LOCAL_ONLY_SETTINGS = new Set(['lastBackupAt']);

export async function exportBackup(db: MfhDB, now = new Date()): Promise<Backup> {
  const [exercises, routines, workouts, settings] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.workouts.toArray(),
    db.settings.toArray(),
  ]);
  return {
    app: 'mfh',
    version: 1,
    exportedAt: now.toISOString(),
    exercises,
    routines,
    workouts,
    settings: settings.filter((s) => !LOCAL_ONLY_SETTINGS.has(s.key)),
  };
}

class BackupError extends Error {}

const EXERCISE_TYPES: ExerciseType[] = ['weight_reps', 'reps', 'duration', 'distance_duration'];
const SET_TYPES: SetType[] = ['normal', 'warmup', 'dropset', 'failure'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') throw new BackupError(`Falta un texto en ${where}.`);
  return v;
}

function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function optNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function isoDate(v: unknown, where: string): string {
  const s = str(v, where);
  if (Number.isNaN(Date.parse(s))) throw new BackupError(`Fecha no válida en ${where}.`);
  return s;
}

function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new BackupError(`Se esperaba una lista en ${where}.`);
  return v;
}

/** Quita las claves con valor undefined para no guardar ruido. */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

function parsePlannedSet(v: unknown, where: string): PlannedSet {
  if (!isObj(v)) throw new BackupError(`Serie no válida en ${where}.`);
  const type = SET_TYPES.includes(v.type as SetType) ? (v.type as SetType) : 'normal';
  return compact({
    type,
    weightKg: optNum(v.weightKg),
    reps: optNum(v.reps),
    durationSec: optNum(v.durationSec),
    distanceM: optNum(v.distanceM),
  });
}

function parseWorkoutSet(v: unknown, where: string): WorkoutSet {
  const base = parsePlannedSet(v, where);
  const o = v as Record<string, unknown>;
  const values = (x: unknown) =>
    isObj(x)
      ? compact({
          weightKg: optNum(x.weightKg),
          reps: optNum(x.reps),
          durationSec: optNum(x.durationSec),
          distanceM: optNum(x.distanceM),
          rpe: optNum(x.rpe),
        })
      : undefined;
  return compact({
    ...base,
    rpe: optNum(o.rpe),
    done: o.done === true,
    hint: values(o.hint),
    prev: values(o.prev),
  });
}

function parseSlot(v: unknown, where: string) {
  if (!isObj(v)) throw new BackupError(`Ejercicio no válido en ${where}.`);
  return {
    exerciseId: str(v.exerciseId, `${where} (exerciseId)`),
    notes: optStr(v.notes),
    restSeconds: optNum(v.restSeconds) ?? 0,
    supersetId: optNum(v.supersetId),
    rawSets: arr(v.sets, `${where} (sets)`),
  };
}

function parseExercise(v: unknown, i: number): Exercise {
  const where = `ejercicio ${i + 1}`;
  if (!isObj(v)) throw new BackupError(`Dato no válido en ${where}.`);
  if (!EXERCISE_TYPES.includes(v.type as ExerciseType)) {
    throw new BackupError(`Tipo de ejercicio desconocido en ${where}.`);
  }
  return compact({
    id: str(v.id, `${where} (id)`),
    name: str(v.name, `${where} (name)`),
    muscle: optStr(v.muscle) ?? 'Otro',
    type: v.type as ExerciseType,
    hevyTemplateId: optStr(v.hevyTemplateId),
    custom: v.custom === true ? true : undefined,
  });
}

function parseRoutine(v: unknown, i: number): Routine {
  const where = `rutina ${i + 1}`;
  if (!isObj(v)) throw new BackupError(`Dato no válido en ${where}.`);
  const exercises: RoutineExercise[] = arr(v.exercises, `${where} (exercises)`).map((e, j) => {
    const { rawSets, ...slot } = parseSlot(e, `${where}, ejercicio ${j + 1}`);
    return compact({ ...slot, sets: rawSets.map((s) => parsePlannedSet(s, where)) });
  });
  return {
    id: str(v.id, `${where} (id)`),
    name: str(v.name, `${where} (name)`),
    order: optNum(v.order) ?? i,
    exercises,
    updatedAt: optStr(v.updatedAt) ?? new Date(0).toISOString(),
  };
}

function parseWorkout(v: unknown, i: number): Workout {
  const where = `entreno ${i + 1}`;
  if (!isObj(v)) throw new BackupError(`Dato no válido en ${where}.`);
  const exercises: WorkoutExercise[] = arr(v.exercises, `${where} (exercises)`).map((e, j) => {
    const { rawSets, ...slot } = parseSlot(e, `${where}, ejercicio ${j + 1}`);
    return compact({ ...slot, sets: rawSets.map((s) => parseWorkoutSet(s, where)) });
  });
  const status = v.status === 'active' ? 'active' : 'done';
  return compact({
    id: str(v.id, `${where} (id)`),
    routineId: optStr(v.routineId),
    name: str(v.name, `${where} (name)`),
    startedAt: isoDate(v.startedAt, `${where} (startedAt)`),
    finishedAt: v.finishedAt === undefined ? undefined : isoDate(v.finishedAt, `${where} (finishedAt)`),
    status,
    notes: optStr(v.notes),
    exercises,
  } satisfies Workout);
}

/**
 * Comprueba que un JSON es una copia de MFH y devuelve una versión limpia.
 * Lanza un Error con un mensaje en español si no lo es.
 */
export function validateBackup(data: unknown): Backup {
  if (!isObj(data) || data.app !== 'mfh') {
    throw new BackupError('Este archivo no es una copia de MFH.');
  }
  if (data.version !== 1) {
    throw new BackupError('La copia es de una versión de MFH que esta app no entiende.');
  }
  const exercises = arr(data.exercises, 'exercises').map(parseExercise);
  const routines = arr(data.routines, 'routines').map(parseRoutine);
  const workouts = arr(data.workouts, 'workouts').map(parseWorkout);
  const settings: Setting[] = Array.isArray(data.settings)
    ? data.settings.flatMap((s) =>
        isObj(s) && typeof s.key === 'string' && !LOCAL_ONLY_SETTINGS.has(s.key)
          ? [{ key: s.key, value: s.value }]
          : [],
      )
    : [];

  const known = new Set(exercises.map((e) => e.id));
  for (const owner of [...routines, ...workouts]) {
    for (const ex of owner.exercises) {
      if (!known.has(ex.exerciseId)) {
        throw new BackupError(`"${owner.name}" usa un ejercicio que no está en la copia.`);
      }
    }
  }
  return {
    app: 'mfh',
    version: 1,
    exportedAt: optStr(data.exportedAt) ?? new Date(0).toISOString(),
    exercises,
    routines,
    workouts,
    settings,
  };
}

/**
 * Importa una copia ya validada.
 * - 'merge': añade y actualiza por id; no borra nada y no toca los ajustes existentes.
 * - 'replace': borra todo lo que hay y deja solo el contenido de la copia.
 */
export async function importBackup(
  db: MfhDB,
  backup: Backup,
  mode: 'merge' | 'replace',
): Promise<ImportResult> {
  await db.transaction('rw', db.exercises, db.routines, db.workouts, db.settings, async () => {
    if (mode === 'replace') {
      await Promise.all([db.exercises.clear(), db.routines.clear(), db.workouts.clear(), db.settings.clear()]);
      await db.settings.bulkPut(backup.settings);
    }
    let workouts = backup.workouts;
    if (mode === 'merge') {
      // No puede haber dos entrenos en curso a la vez: gana el que ya está en el dispositivo.
      const hasActive = (await db.workouts.where('status').equals('active').count()) > 0;
      if (hasActive) workouts = workouts.filter((w) => w.status !== 'active');
    }
    await db.exercises.bulkPut(backup.exercises);
    await db.routines.bulkPut(backup.routines);
    await db.workouts.bulkPut(workouts);
  });
  return {
    exercises: backup.exercises.length,
    routines: backup.routines.length,
    workouts: backup.workouts.length,
  };
}
