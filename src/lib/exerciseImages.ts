import map from '../data/exerciseImages.json';
import type { Exercise } from '../db/schema';

/**
 * Fotos de cada ejercicio: posición inicial y final.
 * Vienen de free-exercise-db (dominio público) y se sirven desde public/ex/.
 * src/data/exerciseImages.json relaciona la plantilla de Hevy con la carpeta de fotos;
 * `approx` marca los casos en que la foto es del mismo movimiento con otro material.
 */
export interface ExerciseImages {
  start: string;
  end: string;
  approx: boolean;
}

const MAP = map as Record<string, { id: string; approx?: boolean }>;

export function imagesFor(exercise: Pick<Exercise, 'hevyTemplateId'> | undefined): ExerciseImages | null {
  const entry = exercise?.hevyTemplateId ? MAP[exercise.hevyTemplateId] : undefined;
  if (!entry) return null;
  const base = `${import.meta.env.BASE_URL}ex/${entry.id}`;
  return { start: `${base}/0.webp`, end: `${base}/1.webp`, approx: entry.approx === true };
}
