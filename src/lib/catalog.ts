import data from '../data/catalog.json';
import type { Exercise, ExerciseType } from '../db/schema';

/**
 * Catálogo de máquinas y ejercicios habituales de gimnasio que no vienen de Hevy.
 * Un ejercicio del catálogo entra en la biblioteca del usuario la primera vez que lo elige.
 */
export interface CatalogEntry {
  id: string;
  name: string;
  muscle: string;
  type: ExerciseType;
  /** Carpeta de fotos en public/ex/. */
  image?: string;
  /** La foto muestra el mismo movimiento con otro material. */
  approx?: boolean;
}

export const CATALOG = data as CatalogEntry[];
export const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Entradas del catálogo que el usuario todavía no tiene (por id de catálogo o por nombre). */
export function catalogNotInLibrary(library: Exercise[]): CatalogEntry[] {
  const ids = new Set(library.map((e) => e.catalogId).filter(Boolean));
  const names = new Set(library.map((e) => fold(e.name)));
  return CATALOG.filter((c) => !ids.has(c.id) && !names.has(fold(c.name)));
}

export function exerciseFromCatalog(entry: CatalogEntry, id: string): Exercise {
  return { id, name: entry.name, muscle: entry.muscle, type: entry.type, catalogId: entry.id };
}
