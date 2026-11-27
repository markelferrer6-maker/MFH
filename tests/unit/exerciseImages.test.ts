import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import map from '../../src/data/exerciseImages.json';
import type { Exercise } from '../../src/db/schema';
import { validateBackup } from '../../src/db/backup';
import { CATALOG, catalogNotInLibrary, exerciseFromCatalog } from '../../src/lib/catalog';

const hevy = Object.entries(map as Record<string, { id: string; approx?: boolean }>);
const TYPES = ['weight_reps', 'reps', 'duration', 'distance_duration'];

describe('fotos de ejercicios', () => {
  it('cada carpeta de fotos usada existe en public/ex con sus dos imágenes', () => {
    const folders = [...hevy.map(([, v]) => v.id), ...CATALOG.flatMap((c) => (c.image ? [c.image] : []))];
    const missing = folders.flatMap((id) =>
      [0, 1].filter((n) => !existsSync(`public/ex/${id}/${n}.webp`)).map((n) => `${id}/${n}.webp`),
    );
    expect(missing).toEqual([]);
  });

  it('las carpetas usan nombres seguros para una URL', () => {
    for (const [templateId, { id }] of hevy) {
      expect(templateId).toMatch(/^[0-9A-F]{8}$/);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    for (const c of CATALOG) if (c.image) expect(c.image).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('catálogo de máquinas', () => {
  it('tiene ids únicos, nombres únicos y tipos válidos', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((c) => c.name)).size).toBe(CATALOG.length);
    for (const c of CATALOG) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(TYPES).toContain(c.type);
      expect(c.muscle).not.toBe('');
    }
  });

  it('oculta lo que el usuario ya tiene, por id de catálogo o por nombre', () => {
    const [a, b] = CATALOG;
    const library: Exercise[] = [
      exerciseFromCatalog(a, 'x1'),
      { id: 'x2', name: b.name.toUpperCase(), muscle: 'Otro', type: 'weight_reps' },
    ];
    const rest = catalogNotInLibrary(library);
    expect(rest).toHaveLength(CATALOG.length - 2);
    expect(rest.map((c) => c.id)).not.toContain(a.id);
    expect(rest.map((c) => c.id)).not.toContain(b.id);
  });

  it('un ejercicio del catálogo sobrevive a exportar e importar', () => {
    const exercise = exerciseFromCatalog(CATALOG[0], 'x1');
    const backup = validateBackup({ app: 'mfh', version: 1, exportedAt: '', exercises: [exercise], routines: [], workouts: [], settings: [] });
    expect(backup.exercises).toEqual([exercise]);
  });
});
