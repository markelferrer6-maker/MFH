import { beforeEach, describe, expect, it } from 'vitest';
import { MfhDB } from '../../src/db/db';
import { exportBackup, importBackup, validateBackup, type Backup } from '../../src/db/backup';
import type { Exercise, Routine, Workout } from '../../src/db/schema';

const exercise: Exercise = { id: 'e1', name: 'Jalón al Pecho (Cable)', muscle: 'Dorsales', type: 'weight_reps', hevyTemplateId: '6A6C31A5' };
const routine: Routine = {
  id: 'r1',
  name: 'TIRÓN — Espalda',
  order: 0,
  updatedAt: '2026-12-15T11:05:30.000Z',
  exercises: [
    { exerciseId: 'e1', restSeconds: 120, notes: 'Codos abajo', supersetId: 0, sets: [{ type: 'normal', weightKg: 70, reps: 8 }] },
  ],
};
const workout: Workout = {
  id: 'w1',
  routineId: 'r1',
  name: 'TIRÓN — Espalda',
  startedAt: '2026-12-15T10:00:00+00:00',
  finishedAt: '2026-12-15T11:05:00+00:00',
  status: 'done',
  exercises: [
    {
      exerciseId: 'e1',
      restSeconds: 120,
      sets: [
        { type: 'normal', weightKg: 70, reps: 8, rpe: 8, done: true },
        { type: 'dropset', weightKg: 62.5, reps: 8, rpe: 9, done: true },
      ],
    },
  ],
};

let n = 0;
let db: MfhDB;
beforeEach(() => {
  db = new MfhDB(`test-${n++}`);
});

async function seed(target: MfhDB) {
  await target.exercises.put(exercise);
  await target.routines.put(routine);
  await target.workouts.put(workout);
  await target.settings.bulkPut([
    { key: 'sound', value: false },
    { key: 'lastBackupAt', value: '2026-11-01T00:00:00Z' },
  ]);
}

describe('copia de seguridad', () => {
  it('exportar e importar en otro dispositivo no pierde nada', async () => {
    await seed(db);
    const json = JSON.stringify(await exportBackup(db));
    const other = new MfhDB(`test-${n++}`);
    const result = await importBackup(other, validateBackup(JSON.parse(json)), 'replace');
    expect(result).toEqual({ exercises: 1, routines: 1, workouts: 1 });
    expect(await other.exercises.toArray()).toEqual([exercise]);
    expect(await other.routines.toArray()).toEqual([routine]);
    expect(await other.workouts.toArray()).toEqual([workout]);
    expect(await other.settings.toArray()).toEqual([{ key: 'sound', value: false }]);
  });

  it('las medidas corporales y la progresión viajan en la copia', async () => {
    await seed(db);
    await db.measurements.put({ id: 'm1', kind: 'weight', date: '2026-01-10T08:00:00.000Z', value: 78.4 });
    await db.routines.put({ ...routine, exercises: [{ ...routine.exercises[0], progression: { repMin: 8, repMax: 10, increment: 2.5 } }] });
    const json = JSON.stringify(await exportBackup(db));
    const other = new MfhDB(`test-${n++}`);
    await importBackup(other, validateBackup(JSON.parse(json)), 'replace');
    expect(await other.measurements.toArray()).toEqual([{ id: 'm1', kind: 'weight', date: '2026-01-10T08:00:00.000Z', value: 78.4 }]);
    expect((await other.routines.get('r1'))?.exercises[0].progression).toEqual({ repMin: 8, repMax: 10, increment: 2.5 });
  });

  it('acepta copias antiguas sin medidas y descarta medidas no válidas', () => {
    const old = { app: 'mfh', version: 1, exportedAt: '', exercises: [], routines: [], workouts: [], settings: [] };
    expect(validateBackup(old).measurements).toEqual([]);
    const dirty = { ...old, measurements: [{ id: 'a', kind: 'altura', date: '2026-01-01', value: 180 }, { id: 'b', kind: 'weight', date: 'ayer', value: 80 }, { id: 'c', kind: 'weight', date: '2026-01-01T00:00:00Z', value: 80 }] };
    expect(validateBackup(dirty).measurements).toEqual([{ id: 'c', kind: 'weight', date: '2026-01-01T00:00:00Z', value: 80 }]);
  });

  it('combinar añade sin borrar lo que ya había', async () => {
    await seed(db);
    const extra: Workout = { ...workout, id: 'w2', startedAt: '2026-11-26T10:00:00Z', finishedAt: '2026-11-26T11:00:00Z' };
    const backup: Backup = { app: 'mfh', version: 1, exportedAt: '', exercises: [exercise], routines: [], workouts: [extra], settings: [{ key: 'sound', value: true }] };
    await importBackup(db, validateBackup(backup), 'merge');
    expect((await db.workouts.toArray()).map((w) => w.id).sort()).toEqual(['w1', 'w2']);
    expect(await db.routines.count()).toBe(1);
    expect((await db.settings.get('sound'))?.value).toBe(false);
  });

  it('combinar no crea un segundo entreno en curso', async () => {
    await db.exercises.put(exercise);
    await db.workouts.put({ ...workout, id: 'local', status: 'active', finishedAt: undefined });
    const incoming: Workout = { ...workout, id: 'remote', status: 'active' };
    await importBackup(db, validateBackup({ app: 'mfh', version: 1, exportedAt: '', exercises: [exercise], routines: [], workouts: [incoming], settings: [] }), 'merge');
    expect((await db.workouts.where('status').equals('active').toArray()).map((w) => w.id)).toEqual(['local']);
  });

  it('reemplazar borra lo anterior', async () => {
    await seed(db);
    await importBackup(db, validateBackup({ app: 'mfh', version: 1, exportedAt: '', exercises: [], routines: [], workouts: [], settings: [] }), 'replace');
    expect(await db.workouts.count()).toBe(0);
    expect(await db.exercises.count()).toBe(0);
  });
});

describe('validateBackup', () => {
  const base = { app: 'mfh', version: 1, exportedAt: '', exercises: [exercise], routines: [routine], workouts: [workout], settings: [] };
  it('rechaza archivos que no son de MFH', () => {
    expect(() => validateBackup({ hola: 1 })).toThrow('no es una copia de Fitness');
    expect(() => validateBackup(null)).toThrow();
    expect(() => validateBackup({ ...base, version: 2 })).toThrow('versión');
  });
  it('rechaza referencias a ejercicios que faltan', () => {
    expect(() => validateBackup({ ...base, exercises: [] })).toThrow('ejercicio que no está en la copia');
  });
  it('rechaza fechas y tipos no válidos', () => {
    expect(() => validateBackup({ ...base, workouts: [{ ...workout, startedAt: 'ayer' }] })).toThrow('Fecha no válida');
    expect(() => validateBackup({ ...base, exercises: [{ ...exercise, type: 'otro' }] })).toThrow('Tipo de ejercicio');
  });
  it('descarta campos desconocidos y valores negativos', () => {
    const dirty = { ...base, workouts: [{ ...workout, hack: true, exercises: [{ ...workout.exercises[0], sets: [{ type: 'normal', done: true, weightKg: -5, reps: 8, x: 1 }] }] }] };
    const clean = validateBackup(dirty);
    expect(clean.workouts[0]).not.toHaveProperty('hack');
    expect(clean.workouts[0].exercises[0].sets[0]).toEqual({ type: 'normal', done: true, reps: 8 });
  });
});
