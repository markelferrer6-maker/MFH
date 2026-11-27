import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../db/db';
import { uid, type Exercise } from '../db/schema';
import {
  RECORD_LABELS,
  RECORD_UNITS,
  exerciseRecords,
  exerciseSessions,
  metricValue,
  recordKindsFor,
  weeklyCounts,
  type RecordKind,
} from '../domain/stats';
import { clock, fmt1, fmtDate, fmtDateShort, relDay, setSummary } from '../lib/format';
import { useDoneWorkouts, useExerciseMap } from '../lib/hooks';
import { goBack, navigate } from '../lib/router';
import { BarChart, LineChart } from '../ui/charts';
import { Sheet, actionSheet, confirmDialog } from '../ui/dialogs';
import { ExerciseForm, fold } from '../ui/ExercisePicker';
import { Icon } from '../ui/Icon';
import { Page } from '../ui/layout';

const METRIC_SHORT: Record<RecordKind, string> = {
  weight: 'Peso máx.',
  e1rm: '1RM est.',
  volume: 'Volumen',
  reps: 'Reps máx.',
  duration: 'Duración',
  distance: 'Distancia',
};

function fmtRecord(kind: RecordKind, value: number): string {
  if (kind === 'duration') return clock(value);
  return `${fmt1(value)} ${RECORD_UNITS[kind]}`;
}

export function Progress() {
  const done = useDoneWorkouts();
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const weeks = useMemo(() => weeklyCounts(done ?? [], 12), [done]);
  const rows = useMemo(() => {
    if (!done || !exercises) return [];
    return exercises
      .map((e) => {
        const sessions = exerciseSessions(done, e.id);
        const [best] = exerciseRecords(sessions, recordKindsFor(e.type));
        return { exercise: e, count: sessions.length, last: sessions[sessions.length - 1]?.date, best };
      })
      .sort((a, b) => b.count - a.count || a.exercise.name.localeCompare(b.exercise.name, 'es'));
  }, [done, exercises]);

  if (!done || !exercises) return <Page title="Progreso">{null}</Page>;

  const q = fold(query.trim());
  const shown = q ? rows.filter((r) => fold(r.exercise.name).includes(q) || fold(r.exercise.muscle).includes(q)) : rows;
  const thisWeek = weeks[weeks.length - 1].count;
  const last4 = weeks.slice(-4).reduce((n, w) => n + w.count, 0);

  return (
    <Page title="Progreso">
      <div className="stats">
        <div className="stat">
          <div className="value">{thisWeek}</div>
          <div className="label">Esta semana</div>
        </div>
        <div className="stat">
          <div className="value">{last4}</div>
          <div className="label">Últimas 4 semanas</div>
        </div>
        <div className="stat">
          <div className="value">{done.length}</div>
          <div className="label">Entrenos en total</div>
        </div>
      </div>

      <div className="card stack">
        <h2>Entrenos por semana</h2>
        <BarChart
          title="Entrenos por semana, últimas 12 semanas"
          unitOne="entreno"
          unitMany="entrenos"
          bars={weeks.map((w, i) => ({
            key: String(w.start.getTime()),
            value: w.count,
            axis: i % 3 === 2 ? fmtDateShort(w.start) : '',
            label: `Semana del ${fmtDateShort(w.start)}`,
          }))}
        />
      </div>

      <h2 className="section-title">Ejercicios</h2>
      <label className="row">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ejercicio o músculo"
          aria-label="Buscar ejercicio o músculo"
        />
      </label>
      <div className="list">
        {shown.map(({ exercise, count, last, best }) => (
          <button className="list-item" key={exercise.id} onClick={() => navigate(`/exercise/${exercise.id}`)}>
            <span className="grow">
              <span className="title ellipsis" style={{ display: 'block' }}>
                {exercise.name}
              </span>
              <span className="small muted">
                {exercise.muscle}
                {count > 0 ? ` · ${count} ${count === 1 ? 'sesión' : 'sesiones'} · ${relDay(last!)}` : ' · sin registros'}
              </span>
            </span>
            {best && <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtRecord(best.kind, best.value)}</span>}
          </button>
        ))}
        {shown.length === 0 && <div className="empty">Ningún ejercicio coincide.</div>}
      </div>
      <button className="btn block" onClick={() => setCreating(true)}>
        <Icon name="plus" size={18} /> Nuevo ejercicio
      </button>

      {creating && (
        <Sheet title="Nuevo ejercicio" onClose={() => setCreating(false)}>
          <ExerciseForm
            submitLabel="Crear ejercicio"
            onSubmit={async (data) => {
              await db.exercises.add({ id: uid(), ...data, custom: true });
              setCreating(false);
            }}
          />
        </Sheet>
      )}
    </Page>
  );
}

export function ExerciseDetail({ id }: { id: string }) {
  const exercises = useExerciseMap();
  const done = useDoneWorkouts();
  const [metric, setMetric] = useState<RecordKind | null>(null);
  const [editing, setEditing] = useState(false);

  const exercise: Exercise | undefined = exercises?.get(id);
  const sessions = useMemo(() => (done ? exerciseSessions(done, id) : []), [done, id]);

  if (!exercises || !done) return <Page title="Ejercicio" back="/progress">{null}</Page>;
  if (!exercise) {
    return (
      <Page title="Ejercicio" back="/progress">
        <div className="empty">Este ejercicio ya no existe.</div>
      </Page>
    );
  }

  const kinds = recordKindsFor(exercise.type);
  const kind = metric && kinds.includes(metric) ? metric : kinds[0];
  const records = exerciseRecords(sessions, kinds);
  const points = sessions
    .map((s) => ({ date: new Date(s.date), value: metricValue(kind, s), label: fmtDateShort(s.date) }))
    .filter((p) => p.value > 0);

  const menu = async () => {
    const choice = await actionSheet({
      title: exercise.name,
      actions: [
        { id: 'edit', label: 'Editar nombre, músculo o tipo' },
        { id: 'delete', label: 'Eliminar ejercicio', danger: true },
      ],
    });
    if (choice === 'edit') setEditing(true);
    else if (choice === 'delete') {
      const inWorkouts = await db.workouts.filter((w) => w.exercises.some((e) => e.exerciseId === id)).count();
      const inRoutines = await db.routines.filter((r) => r.exercises.some((e) => e.exerciseId === id)).count();
      if (inWorkouts + inRoutines > 0) {
        await confirmDialog({
          title: 'No se puede eliminar',
          message: `Este ejercicio aparece en ${inWorkouts} ${inWorkouts === 1 ? 'entreno' : 'entrenos'} y ${inRoutines} ${inRoutines === 1 ? 'rutina' : 'rutinas'}. Quítalo de ahí primero.`,
          confirmLabel: 'Entendido',
          cancelLabel: 'Cerrar',
        });
        return;
      }
      const ok = await confirmDialog({ title: `¿Eliminar ${exercise.name}?`, confirmLabel: 'Eliminar', danger: true });
      if (ok) {
        await db.exercises.delete(id);
        goBack('/progress');
      }
    }
  };

  return (
    <Page
      title={exercise.name}
      back="/progress"
      right={
        <button className="icon-btn" onClick={menu} aria-label="Opciones del ejercicio">
          <Icon name="more" />
        </button>
      }
    >
      <p className="muted">
        {exercise.muscle} · {sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'}
      </p>

      {points.length > 0 ? (
        <div className="card stack">
          {kinds.length > 1 && (
            <div className="chips" role="group" aria-label="Métrica de la gráfica">
              {kinds.map((k) => (
                <button key={k} className={`chip${k === kind ? ' on' : ''}`} aria-pressed={k === kind} onClick={() => setMetric(k)}>
                  {METRIC_SHORT[k]}
                </button>
              ))}
            </div>
          )}
          <h2>
            {RECORD_LABELS[kind]}
            {kind === 'volume' ? '' : ' por sesión'}
          </h2>
          <LineChart points={points} unit={RECORD_UNITS[kind]} title={RECORD_LABELS[kind]} />
          {kind === 'e1rm' && (
            <p className="small muted">Estimación con la fórmula de Epley: peso × (1 + reps / 30). Es orientativa.</p>
          )}
        </div>
      ) : (
        <div className="empty">Todavía no hay series registradas de este ejercicio.</div>
      )}

      {records.length > 0 && (
        <>
          <h2 className="section-title">Récords</h2>
          <div className="list">
            {records.map((r) => (
              <button className="list-item" key={r.kind} onClick={() => navigate(`/history/${r.workoutId}`)}>
                <span className="grow">
                  <span className="title">{RECORD_LABELS[r.kind]}</span>
                  <span className="small muted" style={{ display: 'block' }}>
                    {fmtDate(r.date)}
                  </span>
                </span>
                <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtRecord(r.kind, r.value)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {sessions.length > 0 && (
        <>
          <h2 className="section-title">Sesiones</h2>
          {[...sessions].reverse().map((s) => {
            let n = 0;
            return (
              <button className="card tappable" key={s.workoutId} onClick={() => navigate(`/history/${s.workoutId}`)}>
                <div className="small muted">{fmtDate(s.date)}</div>
                {s.sets.map((set, j) => (
                  <div className="set-line" key={j}>
                    <span className="n">{set.type === 'normal' ? ++n : set.type === 'dropset' ? 'D' : 'F'}</span>
                    <span className="v">{setSummary(set, exercise.type)}</span>
                    {set.rpe !== undefined && <span className="r">RPE {String(set.rpe).replace('.', ',')}</span>}
                  </div>
                ))}
              </button>
            );
          })}
        </>
      )}

      {editing && (
        <Sheet title="Editar ejercicio" onClose={() => setEditing(false)}>
          <ExerciseForm
            initial={exercise}
            submitLabel="Guardar"
            onSubmit={async (data) => {
              await db.exercises.put({ ...exercise, ...data });
              setEditing(false);
            }}
          />
        </Sheet>
      )}
    </Page>
  );
}
