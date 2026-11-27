/** Tipos de datos de la app. Todo se guarda en IndexedDB, en el dispositivo. */

export type ExerciseType = 'weight_reps' | 'reps' | 'duration' | 'distance_duration';
export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure';
export type SetField = 'weightKg' | 'reps' | 'durationSec' | 'distanceM';

/** Qué campos se registran en cada tipo de ejercicio. */
export const TYPE_FIELDS: Record<ExerciseType, SetField[]> = {
  weight_reps: ['weightKg', 'reps'],
  reps: ['reps'],
  duration: ['durationSec'],
  distance_duration: ['distanceM', 'durationSec'],
};

export const TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: 'Peso y repeticiones',
  reps: 'Solo repeticiones',
  duration: 'Duración',
  distance_duration: 'Distancia y duración',
};

export const FIELD_LABELS: Record<SetField, string> = {
  weightKg: 'kg',
  reps: 'Reps',
  durationSec: 'Seg',
  distanceM: 'm',
};

export const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: 'Normal',
  warmup: 'Calentamiento',
  dropset: 'Drop set',
  failure: 'Al fallo',
};

export const MUSCLES = [
  'Pecho',
  'Dorsales',
  'Espalda alta',
  'Trapecios',
  'Lumbares',
  'Hombros',
  'Bíceps',
  'Tríceps',
  'Antebrazos',
  'Cuádriceps',
  'Isquios',
  'Glúteos',
  'Abductores',
  'Aductores',
  'Gemelos',
  'Abdominales',
  'Cuello',
  'Cuerpo completo',
  'Cardio',
  'Otro',
] as const;

export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  type: ExerciseType;
  /** Id de la plantilla de Hevy de la que se importó, si viene de allí. */
  hevyTemplateId?: string;
  custom?: boolean;
}

export interface SetValues {
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
}

export interface PlannedSet extends SetValues {
  type: SetType;
}

export interface WorkoutSet extends PlannedSet {
  rpe?: number;
  done: boolean;
  /** Valores sugeridos (última vez o rutina). Se usan al marcar la serie sin escribir nada. */
  hint?: SetValues;
  /** Lo que se hizo la última vez en esta misma serie; solo informativo. */
  prev?: SetValues & { rpe?: number };
}

interface ExerciseSlot {
  exerciseId: string;
  notes?: string;
  restSeconds: number;
  /** Los ejercicios consecutivos con el mismo número forman una superserie. */
  supersetId?: number;
}

export interface RoutineExercise extends ExerciseSlot {
  sets: PlannedSet[];
}

export interface WorkoutExercise extends ExerciseSlot {
  sets: WorkoutSet[];
}

export interface Routine {
  id: string;
  name: string;
  order: number;
  exercises: RoutineExercise[];
  updatedAt: string;
}

export interface Workout {
  id: string;
  routineId?: string;
  name: string;
  /** Fechas en ISO 8601. */
  startedAt: string;
  finishedAt?: string;
  status: 'active' | 'done';
  notes?: string;
  exercises: WorkoutExercise[];
}

export interface Setting {
  key: string;
  value: unknown;
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
