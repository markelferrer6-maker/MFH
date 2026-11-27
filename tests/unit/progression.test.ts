import { describe, expect, it } from 'vitest';
import type { Exercise, Routine, Workout, WorkoutSet } from '../../src/db/schema';
import { platesPerSide, warmupSets } from '../../src/domain/plates';
import {
  applyProgression,
  defaultProgression,
  progressionSummary,
  suggestNext,
} from '../../src/domain/progression';
import {
  buildWorkoutFromRoutine,
  rememberProgression,
  routineFromWorkout,
  syncProgression,
} from '../../src/domain/workout';

const P = { repMin: 8, repMax: 10, increment: 2.5 };

describe('suggestNext (doble progresión por serie)', () => {
  it('sube el peso y vuelve al mínimo cuando se llegó al tope', () => {
    expect(suggestNext({ weightKg: 70, reps: 10 }, P, 'weight_reps')).toEqual({ weightKg: 72.5, reps: 8 });
    expect(suggestNext({ weightKg: 70, reps: 12 }, P, 'weight_reps')).toEqual({ weightKg: 72.5, reps: 8 });
  });
  it('mantiene el peso y pide una repetición más si no se llegó', () => {
    expect(suggestNext({ weightKg: 70, reps: 8 }, P, 'weight_reps')).toEqual({ weightKg: 70, reps: 9 });
    expect(suggestNext({ weightKg: 70, reps: 5 }, P, 'weight_reps')).toEqual({ weightKg: 70, reps: 6 });
  });
  it('en ejercicios solo de repeticiones pide una más', () => {
    expect(suggestNext({ reps: 4 }, P, 'reps')).toEqual({ reps: 5 });
  });
  it('no toca duraciones ni series sin datos completos', () => {
    expect(suggestNext({ durationSec: 45 }, P, 'duration')).toEqual({ durationSec: 45 });
    expect(suggestNext({ weightKg: 70 }, P, 'weight_reps')).toEqual({ weightKg: 70 });
  });
  it('no arrastra errores de coma flotante', () => {
    expect(suggestNext({ weightKg: 17.5, reps: 10 }, { ...P, increment: 1.25 }, 'weight_reps')).toEqual({ weightKg: 18.75, reps: 8 });
  });
});

describe('defaultProgression', () => {
  it('toma como mínimo las repeticiones planificadas más bajas, sin contar el calentamiento', () => {
    const planned = [
      { type: 'warmup' as const, weightKg: 40, reps: 12 },
      { type: 'normal' as const, weightKg: 60, reps: 6 },
      { type: 'normal' as const, weightKg: 60, reps: 5 },
    ];
    expect(defaultProgression('weight_reps', planned)).toEqual({ repMin: 5, repMax: 7, increment: 2.5 });
  });
  it('sin plan usa la última vez; sin datos o en ejercicios de tiempo no hay progresión', () => {
    expect(defaultProgression('reps', [], [{ type: 'normal', reps: 4 }])).toEqual({ repMin: 4, repMax: 6, increment: 2.5 });
    expect(defaultProgression('weight_reps', [], [])).toBeUndefined();
    expect(defaultProgression('duration', [{ type: 'normal', durationSec: 45 }])).toBeUndefined();
  });
});

describe('progresión al empezar un entreno', () => {
  const exercises = new Map<string, Exercise>([
    ['jalon', { id: 'jalon', name: 'Jalón', muscle: 'Dorsales', type: 'weight_reps' }],
    ['plancha', { id: 'plancha', name: 'Plancha', muscle: 'Abdominales', type: 'duration' }],
  ]);
  const routine: Routine = {
    id: 'r',
    name: 'TIRÓN',
    order: 0,
    updatedAt: '',
    exercises: [
      { exerciseId: 'jalon', restSeconds: 90, sets: [{ type: 'warmup', weightKg: 40, reps: 10 }, { type: 'normal', weightKg: 70, reps: 8 }, { type: 'normal', weightKg: 70, reps: 8 }] },
      { exerciseId: 'plancha', restSeconds: 30, sets: [{ type: 'normal', durationSec: 45 }] },
    ],
  };
  const done = (type: WorkoutSet['type'], weightKg: number, reps: number): WorkoutSet => ({ type, weightKg, reps, done: true });
  const history: Workout[] = [
    { id: 'w', routineId: 'r', name: 'TIRÓN', startedAt: '2026-01-01T10:00:00Z', finishedAt: '2026-01-01T11:00:00Z', status: 'done', exercises: [{ exerciseId: 'jalon', restSeconds: 90, sets: [done('warmup', 40, 10), done('normal', 70, 10), done('normal', 70, 8)] }] },
  ];
  const w = buildWorkoutFromRoutine(routine, history, new Date('2026-01-08T10:00:00Z'), { exercises, auto: true });

  it('resuelve el rango por defecto y sugiere el objetivo de cada serie', () => {
    expect(w.exercises[0].progression).toEqual({ repMin: 8, repMax: 10, increment: 2.5 });
    const [warm, s1, s2] = w.exercises[0].sets;
    expect(warm.hint).toEqual({ weightKg: 40, reps: 10 }); // el calentamiento no progresa
    expect(s1.hint).toEqual({ weightKg: 72.5, reps: 8 }); // llegó a 10: sube peso
    expect(s2.hint).toEqual({ weightKg: 70, reps: 9 }); // hizo 8: una más
    expect(s1.prev).toEqual({ weightKg: 70, reps: 10 });
    expect(progressionSummary(w.exercises[0].sets)).toEqual({ moreWeight: 1, moreReps: 1 });
  });

  it('no aplica progresión a ejercicios de tiempo ni cuando está desactivada', () => {
    expect(w.exercises[1].progression).toBeUndefined();
    const off = buildWorkoutFromRoutine(routine, history, new Date(), { exercises, auto: false });
    expect(off.exercises[0].progression).toBeUndefined();
    expect(off.exercises[0].sets[1].hint).toEqual({ weightKg: 70, reps: 10 });
    const disabled = { ...routine, exercises: [{ ...routine.exercises[0], progression: null }] };
    const d = buildWorkoutFromRoutine(disabled, history, new Date(), { exercises, auto: true });
    expect(d.exercises[0].progression).toBeNull();
    expect(d.exercises[0].sets[1].hint).toEqual({ weightKg: 70, reps: 10 });
  });

  it('fija el rango en la rutina para que no se mueva con las series planificadas', () => {
    const saved = rememberProgression(routine, w);
    expect(saved.exercises[0].progression).toEqual({ repMin: 8, repMax: 10, increment: 2.5 });
    expect(saved.exercises[1].progression).toBeUndefined();
    expect(rememberProgression(saved, w)).toBe(saved);
    // y sobrevive a actualizar la rutina desde el entreno
    const finished: Workout = { ...w, status: 'done', finishedAt: '2026-01-08T11:00:00Z' };
    expect(routineFromWorkout(routine, finished).exercises[0].progression).toEqual({ repMin: 8, repMax: 10, increment: 2.5 });
  });

  it('lleva a la rutina los cambios de progresión hechos durante el entreno', () => {
    const saved = rememberProgression(routine, w);
    const edited: Workout = { ...w, exercises: [{ ...w.exercises[0], progression: { repMin: 6, repMax: 8, increment: 5 } }] };
    expect(syncProgression(saved, edited).exercises[0].progression).toEqual({ repMin: 6, repMax: 8, increment: 5 });
    const off: Workout = { ...w, exercises: [{ ...w.exercises[0], progression: null }] };
    expect(syncProgression(saved, off).exercises[0].progression).toBeNull();
    expect(syncProgression(saved, w)).toBe(saved);
  });

  it('recalcula los objetivos al cambiar la progresión a mitad de entreno', () => {
    const changed = applyProgression({ ...w.exercises[0], progression: { repMin: 10, repMax: 12, increment: 5 } }, 'weight_reps');
    expect(changed.sets[1].hint).toEqual({ weightKg: 70, reps: 11 });
    const none = applyProgression({ ...w.exercises[0], progression: null }, 'weight_reps');
    expect(none.sets[1].hint).toEqual({ weightKg: 70, reps: 10 });
  });
});

describe('discos', () => {
  it('reparte los discos por lado', () => {
    expect(platesPerSide(100, 20)).toEqual({ perSide: [25, 15], total: 100, missing: 0 });
    expect(platesPerSide(52.5, 20)).toEqual({ perSide: [15, 1.25], total: 52.5, missing: 0 });
    expect(platesPerSide(20, 20)).toEqual({ perSide: [], total: 20, missing: 0 });
  });
  it('avisa de lo que falta cuando no se puede exacto', () => {
    expect(platesPerSide(51, 20)).toEqual({ perSide: [15], total: 50, missing: 1 });
    expect(platesPerSide(100, 20, [20, 10])).toEqual({ perSide: [20, 20], total: 100, missing: 0 });
    expect(platesPerSide(15, 20).perSide).toEqual([]);
  });
});

describe('calentamiento', () => {
  it('genera series crecientes por debajo del peso de trabajo', () => {
    expect(warmupSets(100)).toEqual([
      { type: 'warmup', weightKg: 40, reps: 8 },
      { type: 'warmup', weightKg: 60, reps: 5 },
      { type: 'warmup', weightKg: 80, reps: 3 },
    ]);
    expect(warmupSets(30)).toEqual([
      { type: 'warmup', weightKg: 15, reps: 8 },
      { type: 'warmup', weightKg: 22.5, reps: 4 },
    ]);
    expect(warmupSets(10)).toEqual([{ type: 'warmup', weightKg: 5, reps: 8 }]);
    expect(warmupSets(0)).toEqual([]);
  });
});
