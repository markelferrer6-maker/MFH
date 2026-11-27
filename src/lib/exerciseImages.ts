import map from '../data/exerciseImages.json';
import type { Exercise } from '../db/schema';
import { CATALOG_BY_ID } from './catalog';

/**
 * Fotos de cada ejercicio: posición inicial y final.
 * Vienen de free-exercise-db (dominio público) y se sirven desde public/ex/.
 * Los ejercicios importados de Hevy se buscan en src/data/exerciseImages.json por su
 * plantilla; los del catálogo de máquinas, en src/data/catalog.json.
 * `approx` marca los casos en que la foto es del mismo movimiento con otro material.
 */
export interface ExerciseImages {
  start: string;
  end: string;
  approx: boolean;
}

const HEVY = map as Record<string, { id: string; approx?: boolean }>;

export function imagesFor(
  exercise: Pick<Exercise, 'hevyTemplateId' | 'catalogId'> | undefined,
): ExerciseImages | null {
  if (!exercise) return null;
  const hevy = exercise.hevyTemplateId ? HEVY[exercise.hevyTemplateId] : undefined;
  const catalog = exercise.catalogId ? CATALOG_BY_ID.get(exercise.catalogId) : undefined;
  const folder = hevy?.id ?? catalog?.image;
  if (!folder) return null;
  const base = `${import.meta.env.BASE_URL}ex/${folder}`;
  return { start: `${base}/0.webp`, end: `${base}/1.webp`, approx: (hevy ?? catalog)?.approx === true };
}
