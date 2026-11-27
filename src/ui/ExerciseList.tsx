import { useMemo, useRef, useState } from 'react';
import type { Exercise, Workout, WorkoutExercise } from '../db/schema';
import { warmupSets } from '../domain/plates';
import { exerciseSessions, sessionsWithoutProgress } from '../domain/stats';
import { buildExercise, lastPerformance, normalizeSupersets, toggleSupersetWithNext } from '../domain/workout';
import { useSettings } from '../lib/hooks';
import { navigate } from '../lib/router';
import { actionSheet, confirmDialog, openSheet } from './dialogs';
import { ExerciseCard, type CardMode, type SupersetInfo } from './ExerciseCard';
import { ExercisePicker } from './ExercisePicker';
import { Icon } from './Icon';
import { PlateCalculator } from './Tools';

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
  const settings = useSettings();
  // Sesiones sin mejorar de cada ejercicio del entreno, para avisar de estancamiento.
  const ids = items.map((x) => x.exerciseId).join(',');
  const stalled = useMemo(() => {
    const m = new Map<string, number>();
    if (mode !== 'active') return m;
    for (const id of new Set(ids.split(',').filter(Boolean))) {
      const ex = exercises.get(id);
      if (ex) m.set(id, sessionsWithoutProgress(exerciseSessions(history, id), ex.type));
    }
    return m;
  }, [mode, ids, exercises, history]);

  // Progresión resuelta por la última llamada a freshSets (para el ejercicio recién añadido).
  const progressionOf = useRef<WorkoutExercise['progression']>(undefined);

  /** Series iniciales de un ejercicio recién añadido, según la pantalla. */
  const freshSets = (exerciseId: string, count?: number) => {
    const previous = lastPerformance(history, exerciseId);
    if (mode === 'active') {
      const type = exercises.get(exerciseId)?.type;
      const built = buildExercise(
        { exerciseId, restSeconds: defaultRest },
        [],
        history,
        type ? { type, auto: settings.autoProgression } : undefined,
      );
      progressionOf.current = built.progression;
      if (count === undefined || built.sets.length === count) return built.sets;
      return Array.from({ length: count }, (_, i) => built.sets[i] ?? { type: 'normal' as const, done: false });
    }
    progressionOf.current = undefined;
    const n = count ?? (previous.length || 3);
    return Array.from({ length: n }, (_, i) => {
      const p = previous[i];
      const base = p ? { type: p.type, weightKg: p.weightKg, reps: p.reps, durationSec: p.durationSec, distanceM: p.distanceM } : { type: 'normal' as const };
      for (const k of Object.keys(base) as (keyof typeof base)[]) if (base[k] === undefined) delete base[k];
      return { ...base, done: mode === 'edit' };
    });
  };

  const pick = (exerciseId: string) => {
    const withProgression = (item: WorkoutExercise): WorkoutExercise => {
      const { progression: _old, ...rest } = item;
      return progressionOf.current === undefined ? rest : { ...rest, progression: progressionOf.current };
    };
    if (picker?.replace !== undefined) {
      const i = picker.replace;
      const old = items[i];
      const sets = freshSets(exerciseId, old.sets.length);
      onChange(items.map((x, j) => (j === i ? withProgression({ ...old, exerciseId, sets }) : x)));
    } else {
      const sets = freshSets(exerciseId);
      onChange([...items, withProgression({ exerciseId, restSeconds: defaultRest, sets })]);
    }
    setPicker(null);
  };

  /** Sustituye las series de calentamiento por unas generadas a partir de la primera serie de trabajo. */
  const generateWarmup = async (i: number) => {
    const item = items[i];
    const first = item.sets.find((s) => s.type !== 'warmup');
    const weight = first?.weightKg ?? first?.hint?.weightKg;
    if (!weight) {
      await confirmDialog({
        title: 'Falta el peso de trabajo',
        message: 'Pon primero el peso de la primera serie y vuelve a generar el calentamiento.',
        confirmLabel: 'Entendido',
        cancelLabel: 'Cerrar',
      });
      return;
    }
    const generated = warmupSets(weight).map((w) =>
      mode === 'active'
        ? { type: 'warmup' as const, done: false, hint: { weightKg: w.weightKg, reps: w.reps } }
        : { ...w, done: false },
    );
    // Se conservan los calentamientos ya hechos; el resto se sustituye.
    const kept = item.sets.filter((s) => s.type !== 'warmup' || s.done);
    const done = kept.filter((s) => s.type === 'warmup');
    const work = kept.filter((s) => s.type !== 'warmup');
    onChange(items.map((x, j) => (j === i ? { ...item, sets: [...done, ...generated, ...work] } : x)));
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
    const isWeight = exercises.get(item.exerciseId)?.type === 'weight_reps';
    const choice = await actionSheet({
      title: name,
      actions: [
        i > 0 && { id: 'up', label: 'Subir', icon: 'arrowUp' },
        i < items.length - 1 && { id: 'down', label: 'Bajar', icon: 'arrowDown' },
        i < items.length - 1 && {
          id: 'superset',
          icon: 'link',
          label: linkedNext ? 'Separar del siguiente' : 'Hacer superserie con el siguiente',
        },
        isWeight && mode !== 'edit' && { id: 'warmup', label: 'Generar series de calentamiento', icon: 'flame' },
        isWeight && { id: 'plates', label: 'Calculadora de discos', icon: 'dumbbell' },
        { id: 'replace', label: 'Sustituir por otro ejercicio', icon: 'swap' },
        exercises.has(item.exerciseId) && { id: 'progress', label: 'Ver progreso', icon: 'trend' },
        { id: 'remove', label: 'Quitar ejercicio', icon: 'trash', danger: true },
      ],
    });
    if (choice === 'up') move(i, -1);
    else if (choice === 'down') move(i, 1);
    else if (choice === 'superset') onChange(toggleSupersetWithNext(items, i));
    else if (choice === 'warmup') await generateWarmup(i);
    else if (choice === 'plates') {
      const next = item.sets.find((s) => !s.done && s.type !== 'warmup') ?? item.sets.find((s) => s.type !== 'warmup');
      void openSheet('Calculadora de discos', <PlateCalculator initial={next?.weightKg ?? next?.hint?.weightKg} />);
    } else if (choice === 'replace') setPicker({ replace: i });
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
          autoProgression={settings.autoProgression}
          stalled={stalled.get(item.exerciseId)}
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
