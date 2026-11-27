import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../db/db';
import { uid, type Routine } from '../db/schema';
import { lastDoneByRoutine, suggestRoutine } from '../domain/workout';
import { daysBetween, relDay } from '../lib/format';
import { useActiveWorkout, useDoneWorkouts, useExerciseMap, useSettings } from '../lib/hooks';
import { navigate } from '../lib/router';
import { actionSheet, confirmDialog } from '../ui/dialogs';
import { Icon } from '../ui/Icon';
import { Page } from '../ui/layout';
import { startWorkout } from './actions';

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function InstallHint() {
  const [hidden, setHidden] = useState(() => isStandalone() || localStorage.getItem('mfh.installHint') === 'off');
  if (hidden) return null;
  return (
    <div className="card banner">
      <div className="grow">
        <h2>Instala la app</h2>
        <p className="small muted">
          En Safari, pulsa Compartir y luego «Añadir a pantalla de inicio». Importa tus datos dentro de la app
          instalada: lo que guardes en el navegador no pasa a ella.
        </p>
      </div>
      <button
        className="icon-btn"
        aria-label="Ocultar aviso"
        onClick={() => {
          localStorage.setItem('mfh.installHint', 'off');
          setHidden(true);
        }}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

export function Home() {
  const routines = useLiveQuery(() => db.routines.orderBy('order').toArray(), []);
  const done = useDoneWorkouts();
  const active = useActiveWorkout();
  const exercises = useExerciseMap();
  const settings = useSettings();

  const lastDone = useMemo(() => lastDoneByRoutine(done ?? []), [done]);
  const suggested = useMemo(() => suggestRoutine(routines ?? [], done ?? []), [routines, done]);

  if (!routines || !done || !exercises || active === undefined) return <Page title="MFH">{null}</Page>;

  const backupAge = settings.lastBackupAt ? daysBetween(settings.lastBackupAt) : null;
  const needsBackup = done.length > 0 && (backupAge === null || backupAge > 7);

  const move = async (i: number, dir: -1 | 1) => {
    const next = [...routines];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    await db.routines.bulkPut(next.map((r, order) => ({ ...r, order })));
  };

  const menu = async (r: Routine, i: number) => {
    const choice = await actionSheet({
      title: r.name,
      actions: [
        { id: 'edit', label: 'Editar' },
        { id: 'duplicate', label: 'Duplicar' },
        i > 0 && { id: 'up', label: 'Subir' },
        i < routines.length - 1 && { id: 'down', label: 'Bajar' },
        { id: 'delete', label: 'Eliminar rutina', danger: true },
      ],
    });
    if (choice === 'edit') navigate(`/routine/${r.id}`);
    else if (choice === 'duplicate') {
      await db.routines.add({ ...r, id: uid(), name: `${r.name} (copia)`, order: routines.length, updatedAt: new Date().toISOString() });
    } else if (choice === 'up') await move(i, -1);
    else if (choice === 'down') await move(i, 1);
    else if (choice === 'delete') {
      const ok = await confirmDialog({
        title: `¿Eliminar «${r.name}»?`,
        message: 'Los entrenos que ya hiciste con ella se conservan en el historial.',
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (ok) await db.routines.delete(r.id);
    }
  };

  return (
    <Page title="MFH">
      <InstallHint />

      {needsBackup && (
        <div className="card card-warn banner">
          <div className="grow">
            <h2>Haz una copia de seguridad</h2>
            <p className="small">
              {backupAge === null ? 'Aún no has exportado tus datos.' : `La última copia es de hace ${backupAge} días.`} Tus
              entrenos solo están en este móvil.
            </p>
          </div>
          <button className="btn sm" onClick={() => navigate('/settings', { replace: true })}>
            Ir a copias
          </button>
        </div>
      )}

      {!active && suggested && (
        <div className="card card-accent stack">
          <div>
            <div className="small muted">Hoy toca · última vez {relDay(lastDone.get(suggested.id)!)}</div>
            <h2>{suggested.name}</h2>
          </div>
          <button className="btn primary block" onClick={() => startWorkout(suggested)}>
            <Icon name="play" size={18} /> Empezar
          </button>
        </div>
      )}

      {routines.length === 0 && done.length === 0 && (
        <div className="card stack">
          <h2>Empieza aquí</h2>
          <p className="muted">
            Si tienes un archivo de copia o de importación, cárgalo desde Ajustes. Si no, crea tu primera rutina.
          </p>
          <button className="btn primary block" onClick={() => navigate('/settings', { replace: true })}>
            <Icon name="upload" size={18} /> Importar datos
          </button>
        </div>
      )}

      <h2 className="section-title">Rutinas</h2>
      {routines.map((r, i) => {
        const last = lastDone.get(r.id);
        const names = r.exercises.map((e) => exercises.get(e.exerciseId)?.name ?? '¿?').join(' · ');
        return (
          <div className="card stack" key={r.id}>
            <div className="row">
              <button className="grow" style={{ textAlign: 'left' }} onClick={() => navigate(`/routine/${r.id}`)}>
                <h2>{r.name}</h2>
                <div className="small muted">
                  {r.exercises.length} {r.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
                  {last ? ` · última vez ${relDay(last)}` : ' · sin hacer todavía'}
                </div>
              </button>
              <button className="icon-btn" onClick={() => menu(r, i)} aria-label={`Opciones de ${r.name}`}>
                <Icon name="more" />
              </button>
            </div>
            {names && (
              <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {names}
              </p>
            )}
            <button className="btn block" onClick={() => startWorkout(r)}>
              <Icon name="play" size={18} /> Empezar
            </button>
          </div>
        );
      })}

      <div className="row">
        <button className="btn grow" onClick={() => navigate('/routine/new')}>
          <Icon name="plus" size={18} /> Nueva rutina
        </button>
        <button className="btn grow" onClick={() => startWorkout()}>
          Entreno libre
        </button>
      </div>
    </Page>
  );
}
