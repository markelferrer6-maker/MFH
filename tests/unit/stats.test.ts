import { describe, expect, it } from 'vitest';
import type { Exercise, Workout, WorkoutSet } from '../../src/db/schema';
import {
  detectNewRecords,
  epley,
  exerciseRecords,
  exerciseSessions,
  weekStart,
  weeklyCounts,
  workoutVolume,
} from '../../src/domain/stats';

const set = (weightKg: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  type: 'normal',
  done: true,
  weightKg,
  reps,
  ...extra,
});

const workout = (id: string, startedAt: string, sets: WorkoutSet[], exerciseId = 'press'): Workout => ({
  id,
  name: id,
  startedAt,
  finishedAt: startedAt,
  status: 'done',
  exercises: [{ exerciseId, restSeconds: 90, sets }],
});

describe('epley', () => {
  it('devuelve el peso tal cual con 1 repetición', () => {
    expect(epley(100, 1)).toBe(100);
  });
  it('aplica peso × (1 + reps / 30)', () => {
    expect(epley(60, 10)).toBeCloseTo(80, 5);
    expect(epley(70, 8)).toBeCloseTo(88.6667, 3);
  });
  it('devuelve 0 si falta el peso o las reps', () => {
    expect(epley(undefined, 5)).toBe(0);
    expect(epley(50, 0)).toBe(0);
  });
});

describe('exerciseSessions', () => {
  const history = [
    workout('b', '2026-11-10T10:00:00Z', [set(70, 8), set(70, 6), set(40, 10, { type: 'warmup' })]),
    workout('a', '2026-11-03T10:00:00Z', [set(65, 8), set(65, 8, { done: false })]),
    { ...workout('c', '2026-11-12T10:00:00Z', [set(200, 1)]), status: 'active' as const },
  ];

  it('ordena por fecha e ignora calentamientos, series sin hacer y entrenos en curso', () => {
    const s = exerciseSessions(history, 'press');
    expect(s.map((x) => x.workoutId)).toEqual(['a', 'b']);
    expect(s[0].volume).toBe(65 * 8);
    expect(s[1].volume).toBe(70 * 8 + 70 * 6);
    expect(s[1].bestWeight).toBe(70);
    expect(s[1].bestWeightReps).toBe(8);
  });

  it('calcula los récords', () => {
    const recs = exerciseRecords(exerciseSessions(history, 'press'), ['weight', 'e1rm', 'volume']);
    expect(recs.find((r) => r.kind === 'weight')).toMatchObject({ value: 70, workoutId: 'b' });
    expect(recs.find((r) => r.kind === 'volume')).toMatchObject({ value: 980 });
    expect(recs.find((r) => r.kind === 'e1rm')!.value).toBeCloseTo(88.6667, 3);
  });

  it('suma el volumen del entreno sin contar calentamientos', () => {
    expect(workoutVolume(history[0])).toBe(980);
  });
});

describe('detectNewRecords', () => {
  const exercises = new Map<string, Exercise>([
    ['press', { id: 'press', name: 'Press', muscle: 'Pecho', type: 'weight_reps' }],
    ['dominada', { id: 'dominada', name: 'Dominada', muscle: 'Dorsales', type: 'reps' }],
  ]);
  const old = workout('old', '2026-11-01T10:00:00Z', [set(60, 8)]);

  it('detecta récord de peso y de 1RM pero no de volumen', () => {
    const now = workout('now', '2026-11-08T10:00:00Z', [set(65, 5)]);
    const kinds = detectNewRecords(now, [old, now], exercises).map((r) => r.kind);
    expect(kinds).toContain('weight');
    expect(kinds).not.toContain('volume');
    // 65 × (1 + 5/30) = 75,83 < 60 × (1 + 8/30) = 76
    expect(kinds).not.toContain('e1rm');
  });

  it('no marca récords la primera vez que se hace un ejercicio', () => {
    const first = workout('first', '2026-11-08T10:00:00Z', [{ type: 'normal', done: true, reps: 5 }], 'dominada');
    expect(detectNewRecords(first, [old, first], exercises)).toEqual([]);
  });

  it('no compara con entrenos posteriores', () => {
    const later = workout('later', '2026-12-01T10:00:00Z', [set(100, 5)]);
    const now = workout('now', '2026-11-08T10:00:00Z', [set(65, 8)]);
    expect(detectNewRecords(now, [old, later, now], exercises).map((r) => r.kind)).toContain('weight');
  });
});

describe('semanas', () => {
  it('la semana empieza en lunes', () => {
    // 27-11-2026 es viernes
    const start = weekStart(new Date(2026, 10, 27, 15, 0));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(23);
  });
  it('cuenta entrenos por semana', () => {
    const ws = [
      workout('1', new Date(2026, 10, 23, 18).toISOString(), [set(1, 1)]),
      workout('2', new Date(2026, 10, 25, 18).toISOString(), [set(1, 1)]),
      workout('3', new Date(2026, 10, 18, 18).toISOString(), [set(1, 1)]),
    ];
    const counts = weeklyCounts(ws, 3, new Date(2026, 10, 27));
    expect(counts.map((c) => c.count)).toEqual([0, 1, 2]);
  });
});
