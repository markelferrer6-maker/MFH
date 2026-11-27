import { describe, expect, it } from 'vitest';
import type { Routine, Workout, WorkoutSet } from '../../src/db/schema';
import {
  buildWorkoutFromRoutine,
  finishWorkout,
  lastPerformance,
  nextSet,
  normalizeSupersets,
  routineFromWorkout,
  suggestRoutine,
  toggleSet,
  toggleSupersetWithNext,
} from '../../src/domain/workout';

const done = (weightKg: number, reps: number, rpe?: number): WorkoutSet => ({
  type: 'normal',
  done: true,
  weightKg,
  reps,
  ...(rpe !== undefined ? { rpe } : {}),
});

const routine: Routine = {
  id: 'r1',
  name: 'TIRÓN',
  order: 0,
  updatedAt: '2026-11-01T00:00:00Z',
  exercises: [
    {
      exerciseId: 'jalon',
      restSeconds: 120,
      notes: 'Codos abajo',
      supersetId: 0,
      sets: [
        { type: 'warmup', weightKg: 40, reps: 10 },
        { type: 'normal', weightKg: 60, reps: 8 },
        { type: 'normal', weightKg: 60, reps: 8 },
      ],
    },
    { exerciseId: 'curl', restSeconds: 60, supersetId: 0, sets: [{ type: 'normal', weightKg: 20, reps: 10 }] },
  ],
};

const past = (id: string, startedAt: string, sets: WorkoutSet[], routineId = 'r1'): Workout => ({
  id,
  routineId,
  name: 'TIRÓN',
  startedAt,
  finishedAt: startedAt,
  status: 'done',
  exercises: [{ exerciseId: 'jalon', restSeconds: 120, sets }],
});

describe('lastPerformance', () => {
  it('devuelve las series hechas del entreno más reciente', () => {
    const history = [
      past('viejo', '2026-11-01T10:00:00Z', [done(60, 8)]),
      past('nuevo', '2026-11-08T10:00:00Z', [done(65, 8), { type: 'normal', done: false, weightKg: 65, reps: 8 }]),
    ];
    expect(lastPerformance(history, 'jalon')).toEqual([done(65, 8)]);
    expect(lastPerformance(history, 'jalon', '2026-11-08T10:00:00Z')).toEqual([done(60, 8)]);
    expect(lastPerformance(history, 'curl')).toEqual([]);
  });
});

describe('buildWorkoutFromRoutine', () => {
  const history = [past('p', '2026-11-08T10:00:00Z', [done(40, 10), done(70, 8, 8.5)])];
  const w = buildWorkoutFromRoutine(routine, history, new Date('2026-11-15T10:00:00Z'));

  it('copia la estructura de la rutina', () => {
    expect(w.status).toBe('active');
    expect(w.routineId).toBe('r1');
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(['jalon', 'curl']);
    expect(w.exercises[0]).toMatchObject({ notes: 'Codos abajo', restSeconds: 120, supersetId: 0 });
    expect(w.exercises[0].sets.map((s) => s.type)).toEqual(['warmup', 'normal', 'normal']);
  });

  it('deja las series vacías y sugiere lo de la última vez', () => {
    const [s0, s1, s2] = w.exercises[0].sets;
    expect(s1.done).toBe(false);
    expect(s1.weightKg).toBeUndefined();
    expect(s0.hint).toEqual({ weightKg: 40, reps: 10 });
    expect(s1.hint).toEqual({ weightKg: 70, reps: 8 });
    expect(s1.prev).toEqual({ weightKg: 70, reps: 8, rpe: 8.5 });
    // Sin serie anterior equivalente: se sugiere lo planificado en la rutina.
    expect(s2.prev).toBeUndefined();
    expect(s2.hint).toEqual({ weightKg: 60, reps: 8 });
  });

  it('usa la rutina cuando no hay historial del ejercicio', () => {
    expect(w.exercises[1].sets[0].hint).toEqual({ weightKg: 20, reps: 10 });
  });
});

describe('toggleSet y nextSet', () => {
  it('rellena con la sugerencia solo los campos vacíos', () => {
    const s = toggleSet({ type: 'normal', done: false, weightKg: 72.5, hint: { weightKg: 70, reps: 8 } }, ['weightKg', 'reps']);
    expect(s).toMatchObject({ done: true, weightKg: 72.5, reps: 8 });
  });
  it('desmarcar conserva los valores', () => {
    expect(toggleSet(done(70, 8), ['weightKg', 'reps'])).toMatchObject({ done: false, weightKg: 70, reps: 8 });
  });
  it('la serie nueva sugiere los valores de la anterior', () => {
    expect(nextSet([done(70, 8)])).toEqual({ type: 'normal', done: false, hint: { weightKg: 70, reps: 8 } });
    expect(nextSet([])).toEqual({ type: 'normal', done: false });
  });
});

describe('finishWorkout', () => {
  it('descarta lo no hecho y limpia los datos auxiliares', () => {
    const active: Workout = {
      id: 'w',
      name: 'x',
      startedAt: '2026-11-15T10:00:00Z',
      status: 'active',
      exercises: [
        {
          exerciseId: 'jalon',
          restSeconds: 120,
          sets: [
            { ...done(70, 8), hint: { weightKg: 70 }, prev: { weightKg: 65 } },
            { type: 'normal', done: false },
          ],
        },
        { exerciseId: 'curl', restSeconds: 60, sets: [{ type: 'normal', done: false }] },
      ],
    };
    const f = finishWorkout(active, new Date('2026-11-15T11:00:00Z'));
    expect(f.status).toBe('done');
    expect(f.finishedAt).toBe('2026-11-15T11:00:00.000Z');
    expect(f.exercises).toHaveLength(1);
    expect(f.exercises[0].sets).toEqual([done(70, 8)]);
  });

  it('actualiza la rutina con lo que se hizo', () => {
    const f = past('p', '2026-11-08T10:00:00Z', [done(70, 8, 9)]);
    const r = routineFromWorkout(routine, f, new Date('2026-11-08T12:00:00Z'));
    expect(r.exercises).toEqual([{ exerciseId: 'jalon', restSeconds: 120, sets: [{ type: 'normal', weightKg: 70, reps: 8 }] }]);
    expect(r.updatedAt).toBe('2026-11-08T12:00:00.000Z');
  });
});

describe('suggestRoutine', () => {
  const r = (id: string): Routine => ({ id, name: id, order: 0, updatedAt: '', exercises: [] });
  const now = new Date('2026-11-27T12:00:00Z');
  it('sugiere la que lleva más tiempo sin hacerse entre las recientes', () => {
    const history = [
      past('a', '2026-11-25T10:00:00Z', [done(1, 1)], 'tiron'),
      past('b', '2026-11-23T10:00:00Z', [done(1, 1)], 'pierna'),
      past('c', '2026-11-17T10:00:00Z', [done(1, 1)], 'empuje'),
      past('d', '2026-09-01T10:00:00Z', [done(1, 1)], 'abandonada'),
    ];
    const s = suggestRoutine([r('tiron'), r('pierna'), r('empuje'), r('abandonada'), r('nunca')], history, now);
    expect(s?.id).toBe('empuje');
  });
  it('no sugiere nada sin historial suficiente', () => {
    expect(suggestRoutine([r('a'), r('b')], [], now)).toBeUndefined();
  });
});

describe('superseries', () => {
  const ids = (xs: { supersetId?: number }[]) => xs.map((x) => x.supersetId);
  it('une dos ejercicios sueltos', () => {
    expect(ids(toggleSupersetWithNext([{}, {}, {}], 0))).toEqual([0, 0, undefined]);
  });
  it('añade un ejercicio a una superserie existente', () => {
    expect(ids(toggleSupersetWithNext([{ supersetId: 3 }, { supersetId: 3 }, {}], 1))).toEqual([3, 3, 3]);
  });
  it('separa y elimina grupos de un solo ejercicio', () => {
    expect(ids(toggleSupersetWithNext([{ supersetId: 0 }, { supersetId: 0 }], 0))).toEqual([undefined, undefined]);
  });
  it('normaliza grupos rotos al reordenar', () => {
    expect(ids(normalizeSupersets([{ supersetId: 1 }, {}, { supersetId: 1 }]))).toEqual([undefined, undefined, undefined]);
  });
});
