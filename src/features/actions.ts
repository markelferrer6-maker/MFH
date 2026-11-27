import { exportBackup } from '../db/backup';
import { db, getSetting, setSetting } from '../db/db';
import type { Routine } from '../db/schema';
import { buildEmptyWorkout, buildWorkoutFromRoutine, rememberProgression } from '../domain/workout';
import { restTimer } from '../lib/restTimer';
import { navigate } from '../lib/router';
import { actionSheet } from '../ui/dialogs';

/** Empieza un entreno desde una rutina (o libre) y abre su pantalla. */
export async function startWorkout(routine?: Routine): Promise<void> {
  const active = await db.workouts.where('status').equals('active').first();
  if (active) {
    const choice = await actionSheet({
      title: `Ya hay un entreno en curso: ${active.name}`,
      actions: [
        { id: 'continue', label: 'Continuar el que está en curso' },
        { id: 'discard', label: 'Descartarlo y empezar uno nuevo', danger: true },
      ],
    });
    if (choice === 'continue') navigate('/workout');
    if (choice !== 'discard') return;
    await db.workouts.delete(active.id);
    restTimer.stop();
  }
  const history = await db.workouts.where('status').equals('done').toArray();
  if (routine) {
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const auto = await getSetting('autoProgression', true);
    const workout = buildWorkoutFromRoutine(routine, history, new Date(), { exercises, auto });
    await db.workouts.add(workout);
    // Fija en la rutina el rango de repeticiones que se acaba de resolver.
    const remembered = rememberProgression(routine, workout);
    if (remembered !== routine && (await db.routines.get(routine.id))) await db.routines.put(remembered);
  } else {
    await db.workouts.add(buildEmptyWorkout());
  }
  navigate('/workout');
}

/**
 * Exporta todos los datos a un archivo JSON.
 * En el móvil abre la hoja de compartir (para "Guardar en Archivos"); si no se puede, lo descarga.
 * Devuelve false si el usuario cancela.
 */
export async function exportToFile(): Promise<boolean> {
  const now = new Date();
  const backup = await exportBackup(db, now);
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `fitness-copia-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
  const file = new File([JSON.stringify(backup)], name, { type: 'application/json' });

  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Copia de Fitness' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      throw e;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  await setSetting('lastBackupAt', now.toISOString());
  return true;
}
