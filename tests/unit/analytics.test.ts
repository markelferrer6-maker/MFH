import { describe, expect, it } from 'vitest';
import type { Exercise, Workout, WorkoutSet } from '../../src/db/schema';
import {
  activityByDay,
  dayKey,
  exerciseSessions,
  muscleSets,
  sessionsWithoutProgress,
  weekStreak,
} from '../../src/domain/stats';

const set = (weightKg: number, reps: number, type: WorkoutSet['type'] = 'normal'): WorkoutSet => ({ type, done: true, weightKg, reps });
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).toISOString();
const workout = (id: string, startedAt: string, exercises: [string, WorkoutSet[]][]): Workout => ({
  id,
  name: id,
  startedAt,
  finishedAt: startedAt,
  status: 'done',
  exercises: exercises.map(([exerciseId, sets]) => ({ exerciseId, restSeconds: 90, sets })),
});

const exercises = new Map<string, Exercise>([
  ['press', { id: 'press', name: 'Press', muscle: 'Pecho', type: 'weight_reps' }],
  ['jalon', { id: 'jalon', name: 'Jalón', muscle: 'Dorsales', type: 'weight_reps' }],
  ['fondos', { id: 'fondos', name: 'Fondos', muscle: 'Pecho', type: 'reps' }],
]);

describe('estancamiento', () => {
  const sessions = (values: [number, number][]) =>
    exerciseSessions(values.map(([w, r], i) => workout(`w${i}`, at(2026, 1, 1 + i), [['press', [set(w, r)]]])), 'press');
  it('cuenta las sesiones seguidas sin superar la mejor marca', () => {
    expect(sessionsWithoutProgress(sessions([[60, 8], [62.5, 8], [62.5, 8], [62.5, 7], [60, 8]]), 'weight_reps')).toBe(3);
    expect(sessionsWithoutProgress(sessions([[60, 8], [60, 8], [65, 8]]), 'weight_reps')).toBe(0);
    expect(sessionsWithoutProgress(sessions([[60, 8]]), 'weight_reps')).toBe(0);
  });
  it('más repeticiones con el mismo peso cuenta como progreso', () => {
    expect(sessionsWithoutProgress(sessions([[60, 8], [60, 9], [60, 10]]), 'weight_reps')).toBe(0);
  });
  it('no se aplica a ejercicios de tiempo', () => {
    expect(sessionsWithoutProgress(sessions([[60, 8], [60, 8], [60, 8]]), 'duration')).toBe(0);
  });
});

describe('series por músculo', () => {
  const ws = [
    workout('a', at(2026, 11, 23), [['press', [set(40, 10, 'warmup'), set(60, 8), set(60, 8)]], ['jalon', [set(70, 8)]]]),
    workout('b', at(2026, 11, 25), [['fondos', [{ type: 'normal', done: true, reps: 10 }]], ['borrado', [set(1, 1)]]]),
    workout('c', at(2026, 11, 10), [['press', [set(60, 8)]]]),
  ];
  it('cuenta series de trabajo dentro del periodo, por músculo principal', () => {
    const m = muscleSets(ws, exercises, new Date(2026, 10, 23), new Date(2026, 10, 30));
    expect(Object.fromEntries(m)).toEqual({ Pecho: 3, Dorsales: 1 });
  });
});

describe('calendario y racha', () => {
  const ws = [
    workout('a', at(2026, 11, 25), [['press', [set(60, 8), set(60, 8)]]]),
    workout('b', at(2026, 11, 25, 20), [['jalon', [set(70, 8)]]]),
    workout('c', at(2026, 11, 18), [['press', [set(60, 8)]]]),
    workout('d', at(2026, 11, 3), [['press', [set(60, 8)]]]),
  ];
  it('agrupa por día en hora local', () => {
    const days = activityByDay(ws);
    expect(days.get('2026-11-25')).toEqual({ sets: 3, workoutIds: ['a', 'b'] });
    expect(days.get(dayKey(new Date(2026, 10, 18)))?.sets).toBe(1);
    expect(days.has('2026-11-24')).toBe(false);
  });
  it('cuenta semanas seguidas con entreno', () => {
    // 27-11-2026 es viernes: semanas del 23 y del 16 con entreno; la del 9 sin entreno.
    expect(weekStreak(ws, new Date(2026, 10, 27))).toBe(2);
    // El lunes siguiente, aún sin entrenar esa semana, la racha se mantiene.
    expect(weekStreak(ws, new Date(2026, 10, 30))).toBe(2);
    // Una semana entera sin entrenar la rompe.
    expect(weekStreak(ws, new Date(2026, 11, 8))).toBe(0);
    expect(weekStreak([], new Date())).toBe(0);
  });
});
