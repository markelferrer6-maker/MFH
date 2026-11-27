#!/usr/bin/env node
/**
 * Prueba de extremo a extremo sobre la app compilada, con tamaño de iPhone.
 *
 *   npm run build && npm run e2e
 *
 * Variables opcionales:
 *   MFH_IMPORT=/ruta/a/copia.json   usa una copia real en vez de los datos de ejemplo
 *   MFH_SHOTS=1                     guarda capturas en tests/e2e/shots/
 *   MFH_SCHEME=light                prueba con el tema claro (por defecto, oscuro)
 */
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { chromium, devices } from 'playwright';

const PORT = 4179;
// La app debe funcionar en cualquier subcarpeta (el nombre del repositorio puede cambiar).
const SUBPATH = '/una-carpeta-cualquiera/';
const APP_URL = `http://localhost:${PORT}${SUBPATH}`;
const shotsDir = new URL('./shots/', import.meta.url).pathname;
const shots = process.env.MFH_SHOTS === '1';
if (shots) mkdirSync(shotsDir, { recursive: true });

/* ---------- Datos de ejemplo (inventados) ---------- */
function sampleBackup() {
  const day = (n, h = 18) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  const set = (weightKg, reps, rpe) => ({ type: 'normal', weightKg, reps, rpe, done: true });
  const workout = (id, routineId, name, n, exercises) => ({
    id,
    routineId,
    name,
    startedAt: day(n),
    finishedAt: day(n, 19),
    status: 'done',
    exercises,
  });
  return {
    app: 'mfh',
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: [
      { id: 'press', name: 'Press de Banca (Barra)', muscle: 'Pecho', type: 'weight_reps', hevyTemplateId: '79D0BB3A' },
      { id: 'fondos', name: 'Fondos', muscle: 'Tríceps', type: 'reps' },
      { id: 'jalon', name: 'Jalón al Pecho (Cable)', muscle: 'Dorsales', type: 'weight_reps' },
      { id: 'curl', name: 'Curl de Bíceps (Mancuerna)', muscle: 'Bíceps', type: 'weight_reps' },
      { id: 'plancha', name: 'Plancha', muscle: 'Abdominales', type: 'duration' },
    ],
    routines: [
      {
        id: 'empuje',
        name: 'EMPUJE',
        order: 0,
        updatedAt: day(20),
        exercises: [
          { exerciseId: 'press', restSeconds: 120, notes: 'Escápulas atrás.', sets: [{ type: 'warmup', weightKg: 40, reps: 10 }, { type: 'normal', weightKg: 60, reps: 8 }, { type: 'normal', weightKg: 60, reps: 8 }] },
          { exerciseId: 'fondos', restSeconds: 90, sets: [{ type: 'normal', reps: 10 }, { type: 'normal', reps: 10 }] },
        ],
      },
      {
        id: 'tiron',
        name: 'TIRÓN',
        order: 1,
        updatedAt: day(20),
        exercises: [
          { exerciseId: 'jalon', restSeconds: 15, supersetId: 0, sets: [{ type: 'normal', weightKg: 60, reps: 10 }, { type: 'normal', weightKg: 60, reps: 10 }] },
          { exerciseId: 'curl', restSeconds: 90, supersetId: 0, sets: [{ type: 'normal', weightKg: 12.5, reps: 10 }, { type: 'normal', weightKg: 12.5, reps: 10 }] },
          { exerciseId: 'plancha', restSeconds: 30, sets: [{ type: 'normal', durationSec: 45 }] },
        ],
      },
    ],
    workouts: [
      workout('w1', 'empuje', 'EMPUJE', 15, [{ exerciseId: 'press', restSeconds: 120, sets: [set(55, 8, 8), set(55, 8, 9)] }]),
      workout('w2', 'tiron', 'TIRÓN', 13, [{ exerciseId: 'jalon', restSeconds: 15, sets: [set(55, 10, 8)] }, { exerciseId: 'curl', restSeconds: 90, sets: [set(10, 12, 8)] }]),
      workout('w3', 'empuje', 'EMPUJE', 8, [{ exerciseId: 'press', restSeconds: 120, sets: [{ ...set(40, 10), type: 'warmup', rpe: undefined }, set(57.5, 8, 8.5), set(57.5, 7, 9.5)] }, { exerciseId: 'fondos', restSeconds: 90, sets: [{ type: 'normal', reps: 9, done: true }] }]),
      workout('w4', 'tiron', 'TIRÓN', 2, [{ exerciseId: 'jalon', restSeconds: 15, sets: [set(60, 9, 9)] }, { exerciseId: 'plancha', restSeconds: 30, sets: [{ type: 'normal', durationSec: 50, done: true }] }]),
    ],
    settings: [],
  };
}

/* ---------- Utilidades ---------- */
let step = 0;
const log = (msg) => console.log(`  ✓ ${msg}`);
function assert(cond, msg) {
  if (!cond) throw new Error(`FALLO: ${msg}`);
  log(msg);
}
async function shot(page, name) {
  if (!shots) return;
  step++;
  await page.screenshot({ path: join(shotsDir, `${String(step).padStart(2, '0')}-${name}.png`) });
}

const DIST = new URL('../../dist/', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
// Servidor estático mínimo que publica dist/ bajo SUBPATH, como hace GitHub Pages.
const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (!pathname.startsWith(SUBPATH)) return res.writeHead(404).end();
  let rel = decodeURIComponent(pathname.slice(SUBPATH.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(DIST, rel));
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
const stopServer = () => server.close();

async function waitForServer() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  if (!(await fetch(APP_URL)).ok) throw new Error('No hay nada en dist/. ¿Has ejecutado "npm run build"?');
}

const importPath = process.env.MFH_IMPORT ?? join(mkdtempSync(join(tmpdir(), 'mfh-')), 'copia.json');
if (!process.env.MFH_IMPORT) writeFileSync(importPath, JSON.stringify(sampleBackup()));
const imported = JSON.parse(readFileSync(importPath, 'utf8'));
const routine = [...imported.routines].sort((a, b) => a.order - b.order)[0];
const firstExercise = imported.exercises.find((e) => e.id === routine.exercises[0].exerciseId);

await waitForServer();
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: shots ? 2 : 1, locale: 'es-ES', acceptDownloads: true, colorScheme: process.env.MFH_SCHEME === 'light' ? 'light' : 'dark' });
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  console.log('Arranque');
  await page.goto(APP_URL);
  await page.getByText('Empieza aquí').waitFor();
  assert(true, 'la app vacía muestra la bienvenida');
  await shot(page, 'vacia');

  console.log('Importar');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByLabel('Archivo de copia').setInputFiles(importPath);
  await page.getByText(`Importado: ${imported.workouts.length} entrenos`).waitFor();
  assert(true, `importa ${imported.workouts.length} entrenos, ${imported.routines.length} rutinas y ${imported.exercises.length} ejercicios`);
  await shot(page, 'ajustes');

  console.log('Inicio');
  await page.getByRole('button', { name: 'Inicio' }).click();
  await page.getByRole('heading', { name: 'Rutinas' }).waitFor();
  const cards = await page.locator('.card h2').allTextContents();
  assert(imported.routines.every((r) => cards.includes(r.name)), 'aparecen todas las rutinas importadas');
  await shot(page, 'inicio');

  console.log('Entreno');
  const card = page.locator('.card', { has: page.getByRole('heading', { name: routine.name, exact: true }) }).last();
  await card.getByRole('button', { name: 'Empezar' }).click();
  await page.getByRole('button', { name: 'Terminar', exact: true }).waitFor();
  const exCards = page.locator('section.ex-card');
  assert((await exCards.count()) === routine.exercises.length, `el entreno tiene los ${routine.exercises.length} ejercicios de la rutina`);
  const first = exCards.first();
  const prevText = (await first.locator('.set-prev').allTextContents()).join(' | ');
  assert(/\d/.test(prevText), `muestra la referencia de la última vez (${prevText})`);
  await shot(page, 'entreno-inicio');

  // Fotos del ejercicio: miniatura en la tarjeta y vista grande al tocarla.
  if (firstExercise.hevyTemplateId) {
    const help = first.getByRole('button', { name: /Ver cómo se hace/ });
    if (await help.count()) {
      await help.click();
      const photos = page.getByRole('dialog').locator('.ex-images img');
      await photos.first().waitFor();
      const loaded = await photos.evaluateAll(async (imgs) => {
        await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
        return imgs.filter((i) => i.naturalWidth > 0).length;
      });
      assert(loaded === 2, 'las dos fotos del ejercicio (inicio y final) cargan');
      await page.getByRole('button', { name: 'Cerrar' }).click();
    }
  }

  // Marcar la primera serie sin escribir: se rellena con lo sugerido y arranca el descanso.
  const checks = first.getByRole('button', { name: /Marcar hecha la serie/ });
  const inputsBefore = await first.locator('.set-input').first().inputValue();
  assert(inputsBefore === '', 'las series empiezan vacías, con la sugerencia como marcador');
  await checks.first().click();
  const filled = await first.locator('.set-input').first().inputValue();
  assert(filled !== '', `al marcar, la serie toma el valor sugerido (${filled})`);
  if (routine.exercises[0].restSeconds > 0) {
    await page.getByRole('timer').waitFor();
    assert(true, 'arranca el temporizador de descanso');
    await page.getByRole('button', { name: 'Añadir 15 segundos' }).click();
  }
  await shot(page, 'entreno-descanso');

  // Escribir un valor con coma decimal en la segunda serie y marcarla.
  if (firstExercise.type === 'weight_reps' && (await first.locator('.set-input').count()) >= 4) {
    const kg = first.locator('.set-input').nth(2);
    await kg.fill('62,5');
    await first.locator('.set-input').nth(3).fill('6');
    await first.getByRole('button', { name: /Marcar hecha la serie 2/ }).click();
    assert((await kg.inputValue()) === '62,5', 'acepta decimales con coma');
  }
  await first.getByRole('button', { name: 'Añadir serie' }).click();
  await shot(page, 'entreno-series');

  // Añadir una máquina del catálogo que no estaba en la biblioteca.
  await page.getByRole('button', { name: 'Añadir ejercicio' }).click();
  await page.getByPlaceholder('Buscar ejercicio').fill('hack');
  await page.getByRole('dialog').getByRole('button', { name: /Sentadilla Hack/ }).click();
  await page.locator('section.ex-card', { hasText: 'Sentadilla Hack (Máquina)' }).waitFor();
  assert((await exCards.count()) === routine.exercises.length + 1, 'se puede añadir una máquina del catálogo al entreno');
  await shot(page, 'catalogo');

  // Recargar a mitad del entreno: no se pierde nada.
  await page.reload();
  await page.getByRole('button', { name: 'Terminar', exact: true }).waitFor();
  const doneAfterReload = await page.getByRole('button', { name: /Desmarcar la serie/ }).count();
  assert(doneAfterReload >= 1, `tras recargar siguen marcadas las series hechas (${doneAfterReload})`);

  if (await page.getByRole('timer').count()) await page.getByRole('button', { name: 'Saltar' }).click();
  await page.getByRole('button', { name: 'Terminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Terminar', exact: true }).click();
  const updateRoutine = page.getByRole('button', { name: 'Dejarla como estaba' });
  await Promise.race([updateRoutine.waitFor(), page.getByText('Duración').waitFor()]);
  if (await updateRoutine.count()) {
    assert(true, 'pregunta si actualizar la rutina al haber cambiado su estructura');
    await updateRoutine.click();
  }
  await page.getByText('Duración').waitFor();
  assert((await page.locator('.set-line').count()) === doneAfterReload, 'el entreno guardado solo contiene las series hechas');
  await shot(page, 'resumen');

  console.log('Historial y progreso');
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Historial' }).click();
  await page.locator('.list-item').first().waitFor();
  assert((await page.locator('.list-item').count()) === imported.workouts.length + 1, 'el historial tiene un entreno más que la copia');
  await shot(page, 'historial');

  await page.getByRole('button', { name: 'Progreso' }).click();
  await page.locator('.chart svg').first().waitFor();
  await shot(page, 'progreso');
  await page.getByPlaceholder('Buscar ejercicio o músculo').fill(firstExercise.name.slice(0, 8));
  await page.locator('.list-item', { hasText: firstExercise.name }).first().click();
  await page.locator('.chart svg .line').waitFor();
  assert(true, `la ficha de «${firstExercise.name}» dibuja su gráfica`);
  await page.locator('.chart svg').scrollIntoViewIfNeeded();
  const box = await page.locator('.chart svg').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.locator('.chart-tip').waitFor();
  assert(true, 'la gráfica muestra el valor al pasar el dedo');
  await shot(page, 'ejercicio');

  console.log('Copia de seguridad');
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar copia' }).click()]);
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
  assert(exported.app === 'mfh' && exported.workouts.length === imported.workouts.length + 1, 'la copia exportada incluye el entreno nuevo');
  assert(/^mfh-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), `nombre del archivo: ${download.suggestedFilename()}`);

  console.log('Sin conexión');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => page.reload());
  await context.setOffline(true);
  await page.goto(APP_URL);
  await page.getByRole('heading', { name: 'Rutinas' }).waitFor();
  assert(true, 'la app carga sin red');
  await page.getByRole('button', { name: 'Historial' }).click();
  await page.locator('.list-item').first().waitFor();
  assert((await page.locator('.list-item').count()) === imported.workouts.length + 1, 'los datos siguen ahí sin red');
  await context.setOffline(false);

  const real = errors.filter((e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(e));
  assert(real.length === 0, `sin errores en la consola${real.length ? `: ${real.join(' / ')}` : ''}`);
  console.log('\nTodo correcto.');
} catch (e) {
  await page.screenshot({ path: join(tmpdir(), 'mfh-e2e-fallo.png') }).catch(() => {});
  console.error(`\n${e.message}\nCaptura del fallo: ${join(tmpdir(), 'mfh-e2e-fallo.png')}`);
  if (errors.length) console.error(`Errores de consola:\n${errors.join('\n')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  stopServer();
}
