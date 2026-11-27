#!/usr/bin/env node
/**
 * Convierte un volcado de Hevy a un archivo de copia de MFH.
 *
 *   node scripts/hevy-to-mfh.mjs <carpeta-del-volcado> [salida.json]
 *
 * La carpeta debe contener routines/*.json, workouts/*.json (un objeto de la API
 * de Hevy por archivo) y templates.json (lista de plantillas de ejercicio).
 * Requiere Node 22.18 o posterior (importa TypeScript directamente).
 *
 * El archivo resultante contiene datos personales: no lo subas al repositorio.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateBackup } from '../src/db/backup.ts';
import { convertHevy } from '../src/import/hevy.ts';

const [dir, out = 'mfh-import.json'] = process.argv.slice(2);
if (!dir) {
  console.error('Uso: node scripts/hevy-to-mfh.mjs <carpeta-del-volcado> [salida.json]');
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readDir = (name) =>
  readdirSync(join(dir, name))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(dir, name, f)));

const { backup, warnings } = convertHevy({
  routines: readDir('routines'),
  workouts: readDir('workouts'),
  templates: readJson(join(dir, 'templates.json')),
});

// La misma comprobación que hará la app al importar.
validateBackup(JSON.parse(JSON.stringify(backup)));

writeFileSync(out, JSON.stringify(backup));
const sets = backup.workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
console.log(`Escrito ${resolve(out)}`);
console.log(`${backup.workouts.length} entrenos (${sets} series), ${backup.routines.length} rutinas, ${backup.exercises.length} ejercicios.`);
for (const w of warnings) console.warn(`Aviso: ${w}`);
