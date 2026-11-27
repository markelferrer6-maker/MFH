import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { uid, type Routine, type RoutineExercise, type WorkoutExercise } from '../db/schema';
import { pickValues } from '../domain/workout';
import { useDoneWorkouts, useExerciseMap, useSettings } from '../lib/hooks';
import { goBack } from '../lib/router';
import { confirmDialog } from '../ui/dialogs';
import { ExerciseList } from '../ui/ExerciseList';
import { Page } from '../ui/layout';
import { startWorkout } from './actions';

const toEditable = (e: RoutineExercise): WorkoutExercise => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: false })) });

const toRoutine = (e: WorkoutExercise): RoutineExercise => {
  const out: RoutineExercise = {
    exerciseId: e.exerciseId,
    restSeconds: e.restSeconds,
    sets: e.sets.map((s) => ({ type: s.type, ...pickValues(s) })),
  };
  if (e.notes) out.notes = e.notes;
  if (e.supersetId !== undefined) out.supersetId = e.supersetId;
  return out;
};

export function RoutineEditor({ id }: { id: string }) {
  const isNew = id === 'new';
  const [original, setOriginal] = useState<Routine | null | undefined>(isNew ? null : undefined);
  const [name, setName] = useState('');
  const [items, setItems] = useState<WorkoutExercise[]>([]);
  const [dirty, setDirty] = useState(false);
  const exercises = useExerciseMap();
  const history = useDoneWorkouts();
  const settings = useSettings();

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    void db.routines.get(id).then((r) => {
      if (!alive) return;
      setOriginal(r ?? null);
      if (r) {
        setName(r.name);
        setItems(r.exercises.map(toEditable));
      }
    });
    return () => {
      alive = false;
    };
  }, [id, isNew]);

  if (original === undefined || !exercises || !history) return <Page title="Rutina" back="/">{null}</Page>;
  if (!isNew && original === null) {
    return (
      <Page title="Rutina" back="/">
        <div className="empty">Esta rutina ya no existe.</div>
      </Page>
    );
  }

  const build = async (): Promise<Routine> => ({
    id: original?.id ?? uid(),
    name: name.trim(),
    order: original?.order ?? (await db.routines.count()),
    exercises: items.map(toRoutine),
    updatedAt: new Date().toISOString(),
  });

  const save = async () => {
    await db.routines.put(await build());
    goBack('/');
  };

  const back = async () => {
    if (
      !dirty ||
      (await confirmDialog({
        title: '¿Salir sin guardar?',
        message: 'Se perderán los cambios de esta rutina.',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir editando',
        danger: true,
      }))
    ) {
      goBack('/');
    }
  };

  const canSave = name.trim() !== '' && items.length > 0;

  return (
    <Page
      title={isNew ? 'Nueva rutina' : 'Editar rutina'}
      back="/"
      onBack={back}
      right={
        <button className="btn primary sm" onClick={save} disabled={!canSave}>
          Guardar
        </button>
      }
    >
      <input
        className="input title-input"
        value={name}
        placeholder="Nombre de la rutina"
        aria-label="Nombre de la rutina"
        onChange={(e) => {
          setName(e.target.value);
          setDirty(true);
        }}
      />
      <ExerciseList
        items={items}
        mode="plan"
        exercises={exercises}
        history={history}
        defaultRest={settings.defaultRest}
        onChange={(next) => {
          setItems(next);
          setDirty(true);
        }}
      />
      {!isNew && (
        <button
          className="btn block"
          disabled={!canSave}
          onClick={async () => {
            const routine = await build();
            await db.routines.put(routine);
            await startWorkout(routine);
          }}
        >
          {dirty ? 'Guardar y empezar entreno' : 'Empezar entreno'}
        </button>
      )}
      {!canSave && <p className="small muted">Para guardar, pon un nombre y añade al menos un ejercicio.</p>}
    </Page>
  );
}
