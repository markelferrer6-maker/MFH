import { useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import type { Workout, WorkoutExercise } from '../db/schema';
import { doneSetCount, finishWorkout, routineFromWorkout, structureDiffers } from '../domain/workout';
import { clock } from '../lib/format';
import { useDoneWorkouts, useExerciseMap, useNow, useSettings, useWakeLock } from '../lib/hooks';
import { restTimer } from '../lib/restTimer';
import { goBack, navigate } from '../lib/router';
import { actionSheet, confirmDialog, promptDialog } from '../ui/dialogs';
import { ExerciseList } from '../ui/ExerciseList';
import { Icon } from '../ui/Icon';
import { Page } from '../ui/layout';

export function WorkoutScreen() {
  // Se carga una vez y se edita en memoria; cada cambio se guarda al momento en la base de datos.
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);
  const current = useRef<Workout | null>(null);
  const exercises = useExerciseMap();
  const history = useDoneWorkouts();
  const settings = useSettings();
  const now = useNow(1000);
  useWakeLock(settings.keepAwake && Boolean(workout));

  useEffect(() => {
    let alive = true;
    void db.workouts
      .where('status')
      .equals('active')
      .first()
      .then((w) => {
        if (!alive) return;
        current.current = w ?? null;
        setWorkout(w ?? null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (workout === undefined || !exercises || !history) return <Page title="Entreno" back="/">{null}</Page>;
  if (workout === null) {
    return (
      <Page title="Entreno" back="/">
        <div className="empty">No hay ningún entreno en curso.</div>
        <button className="btn primary block" onClick={() => navigate('/', { replace: true })}>
          Ir a Inicio
        </button>
      </Page>
    );
  }

  const update = (next: Workout) => {
    current.current = next;
    setWorkout(next);
    void db.workouts.put(next);
  };

  const total = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneCount = doneSetCount(workout);

  const discard = async () => {
    await db.workouts.delete(workout.id);
    restTimer.stop();
    navigate('/', { replace: true });
  };

  const finish = async () => {
    const w = current.current!;
    const doneN = doneSetCount(w);
    if (doneN === 0) {
      const ok = await confirmDialog({
        title: 'No has marcado ninguna serie',
        message: 'Sin series hechas no hay nada que guardar. ¿Descartar este entreno?',
        confirmLabel: 'Descartar entreno',
        cancelLabel: 'Seguir entrenando',
        danger: true,
      });
      if (ok) await discard();
      return;
    }
    const pending = w.exercises.reduce((n, e) => n + e.sets.length, 0) - doneN;
    const ok = await confirmDialog({
      title: '¿Terminar el entreno?',
      message:
        pending > 0
          ? `Quedan ${pending} ${pending === 1 ? 'serie sin marcar, que no se guardará' : 'series sin marcar, que no se guardarán'}.`
          : undefined,
      confirmLabel: 'Terminar',
      cancelLabel: 'Seguir entrenando',
    });
    if (!ok) return;

    const finished = finishWorkout(current.current!);
    await db.workouts.put(finished);
    restTimer.stop();

    const routine = finished.routineId ? await db.routines.get(finished.routineId) : undefined;
    if (routine && structureDiffers(routine, finished)) {
      const updateRoutine = await confirmDialog({
        title: '¿Actualizar la rutina?',
        message: `Hoy no has hecho exactamente lo que marca «${routine.name}». Si la actualizas, la rutina quedará con los ejercicios y series que has hecho hoy.`,
        confirmLabel: 'Actualizar rutina',
        cancelLabel: 'Dejarla como estaba',
      });
      if (updateRoutine) await db.routines.put(routineFromWorkout(routine, finished));
    }
    navigate(`/history/${finished.id}`, { replace: true });
  };

  const menu = async () => {
    const choice = await actionSheet({
      title: workout.name,
      actions: [
        { id: 'rename', label: 'Cambiar nombre' },
        { id: 'discard', label: 'Descartar entreno', danger: true },
      ],
    });
    if (choice === 'rename') {
      const name = await promptDialog({ title: 'Nombre del entreno', initial: workout.name });
      if (name) update({ ...current.current!, name });
    } else if (choice === 'discard') {
      const ok = await confirmDialog({
        title: '¿Descartar el entreno?',
        message: 'Se perderá todo lo que has registrado en él.',
        confirmLabel: 'Descartar',
        danger: true,
      });
      if (ok) await discard();
    }
  };

  const onSetDone = (exerciseIndex: number) => {
    const ex = current.current!.exercises[exerciseIndex];
    if (!ex || ex.restSeconds <= 0) return;
    restTimer.start(ex.restSeconds, exercises.get(ex.exerciseId)?.name ?? '', settings.sound);
  };

  return (
    <Page
      title={workout.name}
      back="/"
      onBack={() => goBack('/')}
      right={
        <>
          <button className="icon-btn" onClick={menu} aria-label="Opciones del entreno">
            <Icon name="more" />
          </button>
          <button className="btn primary sm" onClick={finish}>
            Terminar
          </button>
        </>
      }
    >
      <div className="row small muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <Icon name="timer" size={16} />
        <span>{clock((now - Date.parse(workout.startedAt)) / 1000)}</span>
        <span>·</span>
        <span>
          {doneCount} de {total} series
        </span>
      </div>
      <ExerciseList
        items={workout.exercises}
        mode="active"
        exercises={exercises}
        history={history}
        defaultRest={settings.defaultRest}
        onChange={(items: WorkoutExercise[]) => update({ ...current.current!, exercises: items })}
        onSetDone={onSetDone}
      />
      <button className="btn primary block" onClick={finish}>
        Terminar entreno
      </button>
    </Page>
  );
}
