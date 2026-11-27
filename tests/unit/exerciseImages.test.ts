import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import map from '../../src/data/exerciseImages.json';

const entries = Object.entries(map as Record<string, { id: string; approx?: boolean }>);

describe('fotos de ejercicios', () => {
  it('cada ejercicio del mapa tiene sus dos fotos en public/ex', () => {
    const missing = entries.flatMap(([, { id }]) =>
      [0, 1].filter((n) => !existsSync(`public/ex/${id}/${n}.webp`)).map((n) => `${id}/${n}.webp`),
    );
    expect(missing).toEqual([]);
  });

  it('las carpetas usan nombres seguros para una URL', () => {
    for (const [templateId, { id }] of entries) {
      expect(templateId).toMatch(/^[0-9A-F]{8}$/);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
