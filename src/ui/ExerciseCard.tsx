import type { CSSProperties } from 'react';
import {
  FIELD_LABELS,
  SET_TYPE_LABELS,
  TYPE_FIELDS,
  type Exercise,
  type SetField,
  type SetType,
  type WorkoutExercise,
  type WorkoutSet,
} from '../db/schema';
import { nextSet, pickValues, toggleSet } from '../domain/workout';
import { clock, setSummary } from '../lib/format';
import { actionSheet } from './dialogs';
import { ExerciseThumb } from './ExerciseHelp';
import { Icon } from './Icon';
import { AutoTextarea, NumberInput } from './inputs';

/**
 * active: entreno en curso (referencia de la última vez + marcar serie hecha)
 * edit:   corregir un entreno ya terminado (todas las series cuentan como hechas)
 * plan:   planificar una rutina (sin RPE ni marcas)
 */
export type CardMode = 'active' | 'edit' | 'plan';

export interface SupersetInfo {
  label: string;
  color: string;
}

const REST_PRESETS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300];
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const TYPE_SHORT: Record<SetType, string> = { normal: '', warmup: 'C', dropset: 'D', failure: 'F' };

export const restLabel = (sec: number): string => (sec > 0 ? clock(sec) : 'Sin descanso');

export function ExerciseCard({
  exercise,
  item,
  mode,
  superset,
  onChange,
  onSetDone,
  onMenu,
  onTitle,
}: {
  exercise: Exercise | undefined;
  item: WorkoutExercise;
  mode: CardMode;
  superset?: SupersetInfo;
  onChange: (item: WorkoutExercise) => void;
  onSetDone?: (setIndex: number) => void;
  onMenu: () => void;
  onTitle?: () => void;
}) {
  const type = exercise?.type ?? 'weight_reps';
  const fields = TYPE_FIELDS[type];
  const name = exercise?.name ?? 'Ejercicio eliminado';
  const showPrev = mode === 'active';
  const showRpe = mode !== 'plan';
  const showCheck = mode === 'active';

  const columns = [
    '36px',
    showPrev ? 'minmax(0, 1.3fr)' : null,
    ...fields.map(() => 'minmax(0, 1fr)'),
    showRpe ? '40px' : null,
    showCheck ? '42px' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const setAt = (i: number, s: WorkoutSet) => onChange({ ...item, sets: item.sets.map((x, j) => (j === i ? s : x)) });

  const setValue = (i: number, field: SetField, v: number | undefined) => {
    const next = { ...item.sets[i] };
    if (v === undefined) delete next[field];
    else next[field] = v;
    setAt(i, next);
  };

  const setMenu = async (i: number) => {
    const s = item.sets[i];
    const choice = await actionSheet<SetType | 'delete'>({
      title: `Serie ${i + 1} · ${name}`,
      actions: [
        ...(Object.keys(SET_TYPE_LABELS) as SetType[]).map((t) => ({
          id: t,
          label: SET_TYPE_LABELS[t],
          selected: s.type === t,
        })),
        { id: 'delete', label: 'Eliminar serie', danger: true },
      ],
    });
    if (choice === undefined) return;
    if (choice === 'delete') onChange({ ...item, sets: item.sets.filter((_, j) => j !== i) });
    else setAt(i, { ...s, type: choice });
  };

  const rpeMenu = async (i: number) => {
    const s = item.sets[i];
    const choice = await actionSheet({
      title: 'RPE (esfuerzo percibido, 6-10)',
      grid: true,
      actions: [
        ...RPE_VALUES.map((v) => ({ id: String(v), label: String(v).replace('.', ','), selected: s.rpe === v })),
        { id: 'none', label: 'Quitar' },
      ],
    });
    if (choice === undefined) return;
    const next = { ...s };
    if (choice === 'none') delete next.rpe;
    else next.rpe = Number(choice);
    setAt(i, next);
  };

  const restMenu = async () => {
    const choice = await actionSheet({
      title: 'Descanso tras cada serie',
      grid: true,
      actions: REST_PRESETS.map((sec) => ({
        id: String(sec),
        label: sec === 0 ? 'No' : clock(sec),
        selected: item.restSeconds === sec,
      })),
    });
    if (choice !== undefined) onChange({ ...item, restSeconds: Number(choice) });
  };

  const toggle = (i: number) => {
    const next = toggleSet(item.sets[i], fields);
    setAt(i, next);
    if (next.done) onSetDone?.(i);
  };

  const addSet = () => {
    const last = item.sets[item.sets.length - 1];
    let fresh: WorkoutSet;
    if (mode === 'active') fresh = nextSet(item.sets);
    else {
      fresh = {
        type: last && last.type !== 'warmup' ? last.type : 'normal',
        ...(last ? pickValues(last) : {}),
        done: mode === 'edit',
      };
    }
    onChange({ ...item, sets: [...item.sets, fresh] });
  };

  let number = 0;
  return (
    <section
      className={`card ex-card${superset ? ' in-superset' : ''}`}
      style={superset ? ({ '--ss': superset.color } as CSSProperties) : undefined}
      aria-label={name}
    >
      {superset && (
        <div className="ss-label">
          <span className="ss-dot" />
          {superset.label}
        </div>
      )}
      <div className="ex-head">
        <ExerciseThumb exercise={exercise} />
        <button className="ex-title ellipsis" onClick={onTitle} disabled={!onTitle || !exercise}>
          {name}
        </button>
        <button className="icon-btn" onClick={onMenu} aria-label={`Opciones de ${name}`}>
          <Icon name="more" />
        </button>
      </div>
      <AutoTextarea
        className="ex-notes"
        value={item.notes ?? ''}
        placeholder="Añadir nota…"
        label={`Nota de ${name}`}
        onChange={(text) => {
          const next = { ...item };
          if (text) next.notes = text;
          else delete next.notes;
          onChange(next);
        }}
      />
      <div className="ex-meta">
        <button className="chip" onClick={restMenu} aria-label={`Descanso: ${restLabel(item.restSeconds)}`}>
          <Icon name="timer" size={16} />
          {restLabel(item.restSeconds)}
        </button>
      </div>

      <div className="set-grid" style={{ gridTemplateColumns: columns }}>
        <div className="set-head">Serie</div>
        {showPrev && <div className="set-head">Anterior</div>}
        {fields.map((f) => (
          <div className="set-head" key={f}>
            {FIELD_LABELS[f]}
          </div>
        ))}
        {showRpe && <div className="set-head">RPE</div>}
        {showCheck && <div className="set-head" aria-hidden="true" />}

        {item.sets.map((s, i) => {
          const label = s.type === 'normal' ? String(++number) : TYPE_SHORT[s.type];
          const isDone = mode === 'active' && s.done;
          return (
            <div className={`set-row${isDone ? ' done' : ''}`} key={i}>
              <button
                className={`set-label ${s.type}`}
                onClick={() => setMenu(i)}
                aria-label={`Serie ${i + 1}, ${SET_TYPE_LABELS[s.type]}. Cambiar tipo o eliminar`}
              >
                {label}
              </button>
              {showPrev && <div className="set-prev">{s.prev ? setSummary(s.prev, type, true) : '—'}</div>}
              {fields.map((f) => (
                <NumberInput
                  key={f}
                  label={`${FIELD_LABELS[f]}, serie ${i + 1} de ${name}`}
                  decimal={f === 'weightKg'}
                  value={s[f]}
                  placeholder={mode === 'active' ? s.hint?.[f] : undefined}
                  onChange={(v) => setValue(i, f, v)}
                />
              ))}
              {showRpe && (
                <button
                  className={`set-rpe${s.rpe !== undefined ? ' has' : ''}`}
                  onClick={() => rpeMenu(i)}
                  aria-label={`RPE de la serie ${i + 1}: ${s.rpe ?? 'sin indicar'}`}
                >
                  {s.rpe !== undefined ? String(s.rpe).replace('.', ',') : '–'}
                </button>
              )}
              {showCheck && (
                <button
                  className="set-check"
                  onClick={() => toggle(i)}
                  aria-pressed={s.done}
                  aria-label={`${s.done ? 'Desmarcar' : 'Marcar hecha'} la serie ${i + 1} de ${name}`}
                >
                  <Icon name="check" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button className="add-set" onClick={addSet}>
        <Icon name="plus" size={16} /> Añadir serie
      </button>
    </section>
  );
}
