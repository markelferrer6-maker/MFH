import { describe, expect, it } from 'vitest';
import { validateBackup } from '../../src/db/backup';
import { convertHevy, type HevyDump } from '../../src/import/hevy';

// Estructura copiada de respuestas reales de la API de Hevy (valores de ejemplo).
const dump: HevyDump = {
  templates: [
    { id: '1B2B1E7C', title: 'Pull Up', type: 'reps_only', primary_muscle_group: 'lats' },
    { id: '6A6C31A5', title: 'Lat Pulldown (Cable)', type: 'weight_reps', primary_muscle_group: 'lats' },
    { id: 'PLANK', title: 'Plank', type: 'duration', primary_muscle_group: 'abdominals' },
  ],
  routines: [
    {
      id: 'r-tiron',
      title: 'TIRÓN — Espalda',
      updated_at: '2026-12-15T11:05:30.000Z',
      exercises: [
        { title: 'Lat Pulldown (Cable)', index: 1, exercise_template_id: '6A6C31A5', notes: 'Codos abajo.', supersets_id: 0, rest_seconds: 120, sets: [{ index: 0, type: 'normal', weight_kg: 70, reps: 8 }] },
        { title: 'Pull Up', index: 0, exercise_template_id: '1B2B1E7C', supersets_id: 0, rest_seconds: 15, sets: [{ index: 0, type: 'normal', reps: 3 }] },
        { title: 'Plank', index: 2, exercise_template_id: 'PLANK', supersets_id: 2, rest_seconds: 30, sets: [{ index: 0, type: 'normal', duration_seconds: 45 }] },
      ],
    },
    { id: 'r-vieja', title: 'Sin usar', exercises: [] },
  ],
  workouts: [
    {
      id: 'w-old',
      title: 'Entreno suelto 💪',
      description: '',
      start_time: '2026-10-01T10:00:00+00:00',
      end_time: '2026-10-01T10:30:00+00:00',
      exercises: [
        { index: 0, title: 'Dominadas viejas', exercise_template_id: '1B2B1E7C', sets: [{ index: 0, type: 'warmup', reps: 2 }] },
        { index: 1, title: 'Correr', exercise_template_id: 'SIN-PLANTILLA', sets: [{ index: 0, type: 'normal', distance_meters: 2000, duration_seconds: 420 }] },
      ],
    },
    {
      id: 'w-new',
      routine_id: 'r-tiron',
      title: 'TIRÓN — Espalda',
      description: '',
      start_time: '2026-12-15T10:00:00+00:00',
      end_time: '2026-12-15T11:05:00+00:00',
      exercises: [
        { index: 1, title: 'Jalón al Pecho  (Cable)', exercise_template_id: '6A6C31A5', sets: [{ index: 1, type: 'normal', weight_kg: 65, reps: 8, rpe: 9 }, { index: 0, type: 'normal', weight_kg: 70, reps: 8, rpe: 8.5 }] },
        { index: 0, title: 'Dominada', exercise_template_id: '1B2B1E7C', sets: [{ index: 0, type: 'normal', reps: 4, rpe: 9.5 }] },
      ],
    },
  ],
};

const { backup, warnings } = convertHevy(dump, { now: new Date('2026-11-27T12:00:00Z') });

describe('convertHevy', () => {
  it('produce una copia que la app acepta sin cambios', () => {
    expect(validateBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
  });

  it('usa el nombre en español del entreno más reciente y traduce músculo y tipo', () => {
    const byId = new Map(backup.exercises.map((e) => [e.hevyTemplateId, e]));
    expect(byId.get('1B2B1E7C')).toMatchObject({ name: 'Dominada', muscle: 'Dorsales', type: 'reps' });
    expect(byId.get('6A6C31A5')).toMatchObject({ name: 'Jalón al Pecho (Cable)', type: 'weight_reps' });
    expect(byId.get('PLANK')).toMatchObject({ name: 'Plank', muscle: 'Abdominales', type: 'duration' });
  });

  it('deduce el tipo cuando falta la plantilla y lo avisa', () => {
    expect(backup.exercises.find((e) => e.hevyTemplateId === 'SIN-PLANTILLA')).toMatchObject({ type: 'distance_duration', muscle: 'Otro' });
    expect(warnings.join('\n')).toContain('SIN-PLANTILLA');
  });

  it('convierte rutinas respetando orden, descansos, notas y superseries', () => {
    const r = backup.routines[0];
    expect(r.name).toBe('TIRÓN — Espalda');
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(['hevy-1B2B1E7C', 'hevy-6A6C31A5', 'hevy-PLANK']);
    expect(r.exercises[0]).toMatchObject({ restSeconds: 15, supersetId: 0 });
    expect(r.exercises[1]).toMatchObject({ restSeconds: 120, supersetId: 0, notes: 'Codos abajo.' });
    // Superserie de un solo ejercicio: se descarta.
    expect(r.exercises[2].supersetId).toBeUndefined();
    expect(r.exercises[2].sets).toEqual([{ type: 'normal', durationSec: 45 }]);
    // La rutina usada más recientemente va primero.
    expect(backup.routines.map((x) => x.id)).toEqual(['r-tiron', 'r-vieja']);
  });

  it('convierte entrenos: orden por índice, series hechas, RPE y descanso de la rutina', () => {
    const w = backup.workouts.find((x) => x.id === 'w-new')!;
    expect(w).toMatchObject({ routineId: 'r-tiron', status: 'done', startedAt: '2026-12-15T10:00:00.000Z', finishedAt: '2026-12-15T11:05:00.000Z' });
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(['hevy-1B2B1E7C', 'hevy-6A6C31A5']);
    expect(w.exercises[0]).toMatchObject({ restSeconds: 15, sets: [{ type: 'normal', reps: 4, rpe: 9.5, done: true }] });
    expect(w.exercises[1].sets).toEqual([
      { type: 'normal', weightKg: 70, reps: 8, rpe: 8.5, done: true },
      { type: 'normal', weightKg: 65, reps: 8, rpe: 9, done: true },
    ]);
  });

  it('los entrenos sin rutina no llevan routineId y usan un descanso por defecto si no hay otro dato', () => {
    const w = backup.workouts.find((x) => x.id === 'w-old')!;
    expect(w.routineId).toBeUndefined();
    expect(w.name).toBe('Entreno suelto 💪');
    expect(w.exercises[0]).toMatchObject({ restSeconds: 15, sets: [{ type: 'warmup', reps: 2, done: true }] });
    expect(w.exercises[1]).toMatchObject({ restSeconds: 90, sets: [{ type: 'normal', distanceM: 2000, durationSec: 420, done: true }] });
  });
});
