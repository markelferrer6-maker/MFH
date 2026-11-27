import { useMemo, useState } from 'react';
import type { Exercise, Workout, WorkoutExercise } from '../db/schema';
import { buildSets, lastPerformance, normalizeSupersets, toggleSupersetWithNext } from '../domain/workout';
import { navigate } from '../lib/router';
import { actionSheet, confirmDialog } from './dialogs';
import { ExerciseCard, type CardMode, type SupersetInfo } from './ExerciseCard';
import { ExercisePicker } from './ExercisePicker';
import { Icon } from './Icon';

const SS_COLORS = ['var(--ss-1)', 'var(--ss-2)', 'var(--ss-3)', 'var(--ss-4)'];

/** Etiqueta y color de la superserie de cada posición (undefined si va suelto). */
export function supersetInfo(items: { supersetId?: number }[]): (SupersetInfo | undefined)[] {
  const order: number[] = [];
  return items.map((x, i) => {
    if (x.supersetId === undefined) return undefined;
    const linked = items[i - 1]?.supersetId === x.supersetId || items[i + 1]?.supersetId === x.supersetId;
    if (!linked) return undefined;
    let n = order.indexOf(x.supersetId);
    if (n === -1) n = order.push(x.supersetId) - 1;
    return { label: `Superserie ${String.fromCharCode(65 + (n % 26))}`, color: SS_COLORS[n % SS_COLORS.length] };
  });
}

/** Lista editable de ejercicios: la comparten el entreno en curso, las rutinas y la edición del historial. */
export function ExerciseList({
  items,
  mode,
  exercises,
  history,
  defaultRest,
  onChange,
  onSetDone,
}: {
  items: WorkoutExercise[];
  mode: CardMode;
  exercises: Map<string, Exercise>;
  /** Entrenos terminados: de aquí salen la referencia de "la última vez" y el orden del selector. */
  history: Workout[];
  defaultRest: number;
  onChange: (items: WorkoutExercise[]) => void;
  onSetDone?: (exerciseIndex: number, setIndex: number) => void;
}) {
  const [picker, setPicker] = useState<{ replace?: number } | null>(null);
  const supersets = useMemo(() => supersetInfo(items), [items]);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of history) for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + 1);
    return m;
  }, [history]);
  const all = useMemo(() => [...exercises.values()], [exercises]);

  /** Series iniciales de un ejercicio recién añadido, según la pantalla. */
  const freshSets = (exerciseId: string, count?: number) => {
    const previous = lastPerformance(history, exerciseId);
    if (mode === 'active') {
      const built = buildSets([], previous);
      if (count === undefined || built.length === count) return built;
      return Array.from({ length: count }, (_, i) => built[i] ?? { type: 'normal' as const, done: false });
    }
    const n = count ?? (previous.length || 3);
    return Array.from({ length: n }, (_, i) => {
      const p = previous[i];
      const base = p ? { type: p.type, weightKg: p.weightKg, reps: p.reps, durationSec: p.durationSec, distanceM: p.distanceM } : { type: 'normal' as const };
      for (const k of Object.keys(base) as (keyof typeof base)[]) if (base[k] === undefined) delete base[k];
      return { ...base, done: mode === 'edit' };
    });
  };

  const pick = (exerciseId: string) => {
    if (picker?.replace !== undefined) {
      const i = picker.replace;
      const old = items[i];
      onChange(items.map((x, j) => (j === i ? { ...old, exerciseId, sets: freshSets(exerciseId, old.sets.length) } : x)));
    } else {
      onChange([...items, { exerciseId, restSeconds: defaultRest, sets: freshSets(exerciseId) }]);
    }
    setPicker(null);
  };

  const move = (i: number, dir: -1 | 1) => {
    const out = [...items];
    [out[i], out[i + dir]] = [out[i + dir], out[i]];
    onChange(normalizeSupersets(out));
  };

  const menu = async (i: number) => {
    const item = items[i];
    const name = exercises.get(item.exerciseId)?.name ?? 'Ejercicio';
    const linkedNext = item.supersetId !== undefined && items[i + 1]?.supersetId === item.supersetId;
    const choice = await actionSheet({
      title: name,
      actions: [
        i > 0 && { id: 'up', label: 'Subir' },
        i < items.length - 1 && { id: 'down', label: 'Bajar' },
        i < items.length - 1 && {
          id: 'superset',
          label: linkedNext ? 'Separar del siguiente' : 'Hacer superserie con el siguiente',
        },
        { id: 'replace', label: 'Sustituir por otro ejercicio' },
        exercises.has(item.exerciseId) && { id: 'progress', label: 'Ver progreso' },
        { id: 'remove', label: 'Quitar ejercicio', danger: true },
      ],
    });
    if (choice === 'up') move(i, -1);
    else if (choice === 'down') move(i, 1);
    else if (choice === 'superset') onChange(toggleSupersetWithNext(items, i));
    else if (choice === 'replace') setPicker({ replace: i });
    else if (choice === 'progress') navigate(`/exercise/${item.exerciseId}`);
    else if (choice === 'remove') {
      const hasData = item.sets.some((s) => s.done || s.weightKg !== undefined || s.reps !== undefined);
      if (
        !hasData ||
        (await confirmDialog({ title: `¿Quitar ${name}?`, message: 'Se perderán sus series.', confirmLabel: 'Quitar', danger: true }))
      ) {
        onChange(normalizeSupersets(items.filter((_, j) => j !== i)));
      }
    }
  };

  return (
    <>
      {items.map((item, i) => (
        <ExerciseCard
          key={i}
          exercise={exercises.get(item.exerciseId)}
          item={item}
          mode={mode}
          superset={supersets[i]}
          onChange={(next) => onChange(items.map((x, j) => (j === i ? next : x)))}
          onSetDone={onSetDone ? (s) => onSetDone(i, s) : undefined}
          onMenu={() => menu(i)}
          onTitle={() => navigate(`/exercise/${item.exerciseId}`)}
        />
      ))}
      <button className="btn block" onClick={() => setPicker({})}>
        <Icon name="plus" size={18} /> Añadir ejercicio
      </button>
      {picker && (
        <ExercisePicker
          exercises={all}
          usage={usage}
          title={picker.replace !== undefined ? 'Sustituir ejercicio' : 'Añadir ejercicio'}
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
