import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { db } from '../db/db';
import type { Workout } from '../db/schema';
import {
  RECORD_LABELS,
  RECORD_UNITS,
  detectNewRecords,
  workoutDurationSec,
  workoutSetCount,
  workoutVolume,
} from '../domain/stats';
import { fmt1, fmtDate, fmtDuration, fmtInt, fmtMonth, fmtTime, setSummary, toLocalInput } from '../lib/format';
import { useDoneWorkouts, useExerciseMap, useSettings } from '../lib/hooks';
import { goBack, navigate } from '../lib/router';
import { actionSheet, confirmDialog } from '../ui/dialogs';
import { ExerciseThumb } from '../ui/ExerciseHelp';
import { ExerciseList, supersetInfo } from '../ui/ExerciseList';
import { Icon } from '../ui/Icon';
import { NumberInput } from '../ui/inputs';
import { Page } from '../ui/layout';

const weekdayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
const weekdayShort = (iso: string): string => weekdayFmt.format(new Date(iso)).replace('.', '');

function summaryLine(w: Workout): string {
  const parts = [fmtDuration(workoutDurationSec(w)), `${workoutSetCount(w)} series`];
  const vol = workoutVolume(w);
  if (vol > 0) parts.push(`${fmtInt(vol)} kg`);
  return parts.join(' · ');
}

export function History() {
  const done = useDoneWorkouts();
  const groups = useMemo(() => {
    const out: { month: string; items: Workout[] }[] = [];
    for (const w of done ?? []) {
      const month = fmtMonth(w.startedAt);
      const last = out[out.length - 1];
      if (last?.month === month) last.items.push(w);
      else out.push({ month, items: [w] });
    }
    return out;
  }, [done]);

  if (!done) return <Page title="Historial">{null}</Page>;
  return (
    <Page title="Historial">
      {done.length === 0 && (
        <div className="empty">
          <span className="empty-icon">
            <Icon name="history" size={26} />
          </span>
          Aquí aparecerán tus entrenos cuando termines el primero.
        </div>
      )}
      {groups.map((g) => (
        <div className="stack" key={g.month}>
          <h2 className="section-title">
            {g.month} · {g.items.length} {g.items.length === 1 ? 'entreno' : 'entrenos'}
          </h2>
          <div className="list">
            {g.items.map((w) => (
              <button
                className="list-item"
                key={w.id}
                onClick={() => navigate(`/history/${w.id}`)}
                aria-label={`${w.name}, ${fmtDate(w.startedAt)}, ${summaryLine(w)}`}
              >
                <span className="day-badge" aria-hidden="true">
                  <b>{new Date(w.startedAt).getDate()}</b>
                  <span>{weekdayShort(w.startedAt)}</span>
                </span>
                <span className="grow">
                  <span className="title ellipsis" style={{ display: 'block' }}>
                    {w.name}
                  </span>
                  <span className="small muted">{summaryLine(w)}</span>
                </span>
                <span className="muted">
                  <Icon name="chevron" size={18} />
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Page>
  );
}

export function WorkoutDetail({ id }: { id: string }) {
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);
  const [draft, setDraft] = useState<Workout | null>(null);
  const exercises = useExerciseMap();
  const history = useDoneWorkouts();
  const settings = useSettings();

  useEffect(() => {
    let alive = true;
    void db.workouts.get(id).then((w) => alive && setWorkout(w ?? null));
    return () => {
      alive = false;
    };
  }, [id]);

  const records = useMemo(
    () => (workout && history && exercises ? detectNewRecords(workout, history, exercises) : []),
    [workout, history, exercises],
  );

  if (workout === undefined || !exercises || !history) return <Page title="Entreno" back="/history">{null}</Page>;
  if (workout === null || workout.status !== 'done') {
    return (
      <Page title="Entreno" back="/history">
        <div className="empty">Este entreno ya no existe.</div>
      </Page>
    );
  }

  /* ---------- Edición ---------- */
  if (draft) {
    const durationMin = Math.round(workoutDurationSec(draft) / 60);
    const setTimes = (startIso: string, minutes: number) =>
      setDraft({
        ...draft,
        startedAt: startIso,
        finishedAt: new Date(Date.parse(startIso) + minutes * 60_000).toISOString(),
      });
    const canSave = draft.name.trim() !== '' && draft.exercises.some((e) => e.sets.length > 0);
    const save = async () => {
      const clean: Workout = {
        ...draft,
        name: draft.name.trim(),
        exercises: draft.exercises
          .filter((e) => e.sets.length > 0)
          .map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: true })) })),
      };
      await db.workouts.put(clean);
      setWorkout(clean);
      setDraft(null);
    };
    return (
      <Page
        title="Editar entreno"
        back="/history"
        onBack={() => setDraft(null)}
        right={
          <button className="btn primary sm" onClick={save} disabled={!canSave}>
            Guardar
          </button>
        }
      >
        <input
          className="input title-input"
          value={draft.name}
          aria-label="Nombre del entreno"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <div className="row">
          <label className="field grow">
            <span>Inicio</span>
            <input
              className="input"
              type="datetime-local"
              value={toLocalInput(draft.startedAt)}
              onChange={(e) => {
                const t = Date.parse(e.target.value);
                if (!Number.isNaN(t)) setTimes(new Date(t).toISOString(), durationMin);
              }}
            />
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>Duración (min)</span>
            <NumberInput
              className="input"
              label="Duración en minutos"
              value={durationMin}
              onChange={(v) => setTimes(draft.startedAt, v ?? 0)}
            />
          </label>
        </div>
        <ExerciseList
          items={draft.exercises}
          mode="edit"
          exercises={exercises}
          history={history.filter((w) => w.id !== draft.id)}
          defaultRest={settings.defaultRest}
          onChange={(items) => setDraft({ ...draft, exercises: items })}
        />
      </Page>
    );
  }

  /* ---------- Lectura ---------- */
  const menu = async () => {
    const choice = await actionSheet({
      title: workout.name,
      actions: [
        { id: 'edit', label: 'Editar', icon: 'edit' },
        { id: 'delete', label: 'Eliminar entreno', icon: 'trash', danger: true },
      ],
    });
    if (choice === 'edit') setDraft(workout);
    else if (choice === 'delete') {
      const ok = await confirmDialog({
        title: '¿Eliminar este entreno?',
        message: 'Desaparecerá del historial y de tus estadísticas. No se puede deshacer.',
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (ok) {
        await db.workouts.delete(workout.id);
        goBack('/history');
      }
    }
  };

  const supersets = supersetInfo(workout.exercises);
  const volume = workoutVolume(workout);

  return (
    <Page
      title={workout.name}
      back="/history"
      right={
        <button className="icon-btn" onClick={menu} aria-label="Opciones del entreno">
          <Icon name="more" />
        </button>
      }
    >
      <p className="muted">
        {fmtDate(workout.startedAt)} · {fmtTime(workout.startedAt)}
        {workout.finishedAt ? `–${fmtTime(workout.finishedAt)}` : ''}
      </p>
      <div className="stats">
        <div className="stat">
          <span className="ico">
            <Icon name="timer" size={18} />
          </span>
          <div className="value">{fmtDuration(workoutDurationSec(workout))}</div>
          <div className="label">Duración</div>
        </div>
        <div className="stat">
          <span className="ico">
            <Icon name="check" size={18} />
          </span>
          <div className="value">{workoutSetCount(workout)}</div>
          <div className="label">Series</div>
        </div>
        <div className="stat">
          <span className="ico">
            <Icon name="dumbbell" size={18} />
          </span>
          <div className="value">{volume > 0 ? `${fmtInt(volume)} kg` : '—'}</div>
          <div className="label">Volumen</div>
        </div>
      </div>

      {records.length > 0 && (
        <div className="card">
          <h2>
            {records.length} {records.length === 1 ? 'récord personal' : 'récords personales'}
          </h2>
          {records.map((r) => (
            <div className="pr" key={`${r.exerciseId}-${r.kind}`}>
              <span className="ico">
                <Icon name="trophy" />
              </span>
              <div>
                <div style={{ fontWeight: 600 }}>{exercises.get(r.exerciseId)?.name}</div>
                <div className="small muted">
                  {RECORD_LABELS[r.kind]}: {fmt1(r.value)} {RECORD_UNITS[r.kind]} (antes {fmt1(r.previous)})
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {workout.exercises.map((e, i) => {
        const ex = exercises.get(e.exerciseId);
        const ss = supersets[i];
        let n = 0;
        return (
          <section
            className={`card ex-card${ss ? ' in-superset' : ''}`}
            style={ss ? ({ '--ss': ss.color } as CSSProperties) : undefined}
            key={i}
          >
            {ss && (
              <div className="ss-label">
                <span className="ss-dot" />
                {ss.label}
              </div>
            )}
            <div className="ex-head">
              <ExerciseThumb exercise={ex} />
              <button
                className="ex-title ellipsis"
                disabled={!ex}
                onClick={() => navigate(`/exercise/${e.exerciseId}`)}
              >
                {ex?.name ?? 'Ejercicio eliminado'}
              </button>
            </div>
            {e.notes && <p className="small muted" style={{ padding: '0 4px', whiteSpace: 'pre-wrap' }}>{e.notes}</p>}
            <div style={{ padding: '0 4px' }}>
              {e.sets.map((s, j) => (
                <div className="set-line" key={j}>
                  <span className="n">{s.type === 'normal' ? ++n : s.type === 'warmup' ? 'C' : s.type === 'dropset' ? 'D' : 'F'}</span>
                  <span className="v">{setSummary(s, ex?.type ?? 'weight_reps')}</span>
                  {s.rpe !== undefined && <span className="r">RPE {String(s.rpe).replace('.', ',')}</span>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </Page>
  );
}
