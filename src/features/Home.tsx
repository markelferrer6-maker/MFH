import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../db/db';
import { uid, type Exercise, type Routine, type Workout } from '../db/schema';
import { activityByDay, dayKey, weekStart, weekStreak } from '../domain/stats';
import { lastDoneByRoutine, suggestRoutine } from '../domain/workout';
import { daysBetween, relDay } from '../lib/format';
import { useActiveWorkout, useDoneWorkouts, useExerciseMap, useSettings } from '../lib/hooks';
import { navigate } from '../lib/router';
import { actionSheet, confirmDialog } from '../ui/dialogs';
import { ThumbStrip } from '../ui/ExerciseHelp';
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
      <span className="banner-icon">
        <Icon name="download" size={20} />
      </span>
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

const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** La semana en curso, de lunes a domingo, con los días entrenados marcados. */
function WeekCard({ done }: { done: Workout[] }) {
  const now = new Date();
  const start = weekStart(now);
  const days = useMemo(() => activityByDay(done), [done]);
  const streak = useMemo(() => weekStreak(done), [done]);
  const today = dayKey(now);
  const startIso = start.toISOString();
  const count = done.filter((w) => new Date(w.startedAt).toISOString() >= startIso).length;

  return (
    <div className="card stack">
      <div className="row">
        <div className="grow">
          <div className="eyebrow">Esta semana</div>
          <div className="big-num">
            {count} <small>{count === 1 ? 'entreno' : 'entrenos'}</small>
          </div>
        </div>
        {streak > 1 && (
          <span className="chip accent">
            <Icon name="flame" size={16} />
            {streak} semanas seguidas
          </span>
        )}
      </div>
      <div className="week-days" role="list">
        {DAY_LETTERS.map((letter, i) => {
          const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          const key = dayKey(date);
          const trained = days.has(key);
          const cls = `week-day${trained ? ' on' : ''}${key === today ? ' today' : ''}${key > today ? ' future' : ''}`;
          return (
            <div
              key={key}
              className={cls}
              role="listitem"
              aria-label={`${DAY_NAMES[i]} ${date.getDate()}: ${trained ? 'entrenado' : key > today ? 'aún no ha llegado' : 'sin entreno'}`}
            >
              <span className="dot">{trained ? <Icon name="check" size={18} /> : date.getDate()}</span>
              <span aria-hidden="true">{letter}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Los grupos musculares que más pesan en una rutina, para etiquetarla. */
function topMuscles(routine: Routine, exercises: Map<string, Exercise>, max = 3): string[] {
  const counts = new Map<string, number>();
  for (const e of routine.exercises) {
    const muscle = exercises.get(e.exerciseId)?.muscle;
    if (muscle) counts.set(muscle, (counts.get(muscle) ?? 0) + e.sets.length);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([m]) => m);
}

const eyebrowFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

export function Home() {
  const routines = useLiveQuery(() => db.routines.orderBy('order').toArray(), []);
  const done = useDoneWorkouts();
  const active = useActiveWorkout();
  const exercises = useExerciseMap();
  const settings = useSettings();

  const lastDone = useMemo(() => lastDoneByRoutine(done ?? []), [done]);
  const suggested = useMemo(() => suggestRoutine(routines ?? [], done ?? []), [routines, done]);
  const eyebrow = eyebrowFmt.format(new Date());

  if (!routines || !done || !exercises || active === undefined) {
    return (
      <Page title="Fitness" eyebrow={eyebrow}>
        {null}
      </Page>
    );
  }

  const backupAge = settings.lastBackupAt ? daysBetween(settings.lastBackupAt) : null;
  const needsBackup = done.length > 0 && (backupAge === null || backupAge > 7);
  const exercisesOf = (r: Routine) => r.exercises.map((e) => exercises.get(e.exerciseId));
  const countLabel = (r: Routine) => `${r.exercises.length} ${r.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}`;

  const move = async (i: number, dir: -1 | 1) => {
    const next = [...routines];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    await db.routines.bulkPut(next.map((r, order) => ({ ...r, order })));
  };

  const menu = async (r: Routine, i: number) => {
    const choice = await actionSheet({
      title: r.name,
      actions: [
        { id: 'edit', label: 'Editar', icon: 'edit' },
        { id: 'duplicate', label: 'Duplicar', icon: 'copy' },
        i > 0 && { id: 'up', label: 'Subir', icon: 'arrowUp' },
        i < routines.length - 1 && { id: 'down', label: 'Bajar', icon: 'arrowDown' },
        { id: 'delete', label: 'Eliminar rutina', icon: 'trash', danger: true },
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
    <Page title="Fitness" eyebrow={eyebrow}>
      <InstallHint />

      {needsBackup && (
        <div className="card card-warn banner">
          <span className="banner-icon">
            <Icon name="shield" size={20} />
          </span>
          <div className="grow stack" style={{ gap: 8 }}>
            <div>
              <h2>Haz una copia de seguridad</h2>
              <p className="small">
                {backupAge === null ? 'Aún no has exportado tus datos.' : `La última copia es de hace ${backupAge} días.`}{' '}
                Tus entrenos solo están en este móvil.
              </p>
            </div>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/settings', { replace: true })}>
              Ir a copias
            </button>
          </div>
        </div>
      )}

      {done.length > 0 && <WeekCard done={done} />}

      {!active && suggested && (
        <div className="card hero stack">
          <div>
            <div className="eyebrow">Hoy toca</div>
            <h2>{suggested.name}</h2>
            <div className="small muted" style={{ marginTop: 4 }}>
              {countLabel(suggested)} · última vez {relDay(lastDone.get(suggested.id)!)}
            </div>
          </div>
          <ThumbStrip exercises={exercisesOf(suggested)} max={4} />
          <button className="btn primary block lg" onClick={() => startWorkout(suggested)}>
            <Icon name="play" size={18} /> Empezar entreno
          </button>
        </div>
      )}

      {routines.length === 0 && done.length === 0 && (
        <div className="card hero stack">
          <div>
            <div className="eyebrow">Bienvenido</div>
            <h2>Empieza aquí</h2>
          </div>
          <p className="muted">
            Si tienes un archivo de copia o de importación, cárgalo desde Ajustes. Si no, crea tu primera rutina.
          </p>
          <button className="btn primary block lg" onClick={() => navigate('/settings', { replace: true })}>
            <Icon name="upload" size={18} /> Importar datos
          </button>
        </div>
      )}

      <h2 className="section-title">Rutinas</h2>
      {routines.map((r, i) => {
        const last = lastDone.get(r.id);
        const muscles = topMuscles(r, exercises, 2);
        return (
          <div className="card stack" key={r.id}>
            <div className="row">
              <button className="grow" style={{ textAlign: 'left' }} onClick={() => navigate(`/routine/${r.id}`)}>
                <h2>{r.name}</h2>
                <div className="small muted">
                  {countLabel(r)}
                  {last ? ` · última vez ${relDay(last)}` : ' · sin hacer todavía'}
                </div>
              </button>
              <button className="icon-btn" onClick={() => menu(r, i)} aria-label={`Opciones de ${r.name}`}>
                <Icon name="more" />
              </button>
            </div>
            <ThumbStrip exercises={exercisesOf(r)} max={4} />
            <div className="row">
              <div className="chips nowrap grow">
                {muscles.map((m) => (
                  <span className="chip tag" key={m}>
                    {m}
                  </span>
                ))}
              </div>
              <button className="btn sm soft" onClick={() => startWorkout(r)} aria-label={`Empezar ${r.name}`}>
                <Icon name="play" size={16} /> Empezar
              </button>
            </div>
          </div>
        );
      })}

      <div className="row">
        <button className="btn grow" onClick={() => navigate('/routine/new')}>
          <Icon name="plus" size={18} /> Nueva rutina
        </button>
        <button className="btn grow" onClick={() => startWorkout()}>
          <Icon name="dumbbell" size={18} /> Entreno libre
        </button>
      </div>
    </Page>
  );
}
