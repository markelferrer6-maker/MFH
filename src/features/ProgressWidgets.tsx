import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../db/db';
import type { Exercise, Workout } from '../db/schema';
import { activityByDay, dayKey, muscleSets, weekStart, weekStreak } from '../domain/stats';
import { fmt1, fmtDate, fmtDateShort, fmtNum } from '../lib/format';
import { useSettings } from '../lib/hooks';
import { navigate } from '../lib/router';
import { LineChart } from '../ui/charts';
import { Icon } from '../ui/Icon';
import { MuscleMap } from '../ui/MuscleMap';
import { addMeasure, chartPoints, fmtMeasure } from './Body';

/* ---------- Peso corporal ---------- */

export function BodyWeightCard() {
  const rows = useLiveQuery(() => db.measurements.where('kind').equals('weight').sortBy('date'), []);
  const settings = useSettings();
  if (!rows) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const delta = rows.length > 1 ? last.value - first.value : null;
  return (
    <div className="card stack">
      <div className="row">
        <div className="grow">
          <h2>Peso corporal</h2>
          <div className="small muted">
            {last ? `${fmtMeasure('weight', last.value)} · ${fmtDate(last.date)}` : 'Aún no has registrado tu peso.'}
            {delta !== null && ` · ${delta > 0 ? '+' : ''}${fmtNum(Math.round(delta * 10) / 10)} kg desde el ${fmtDateShort(first.date)}`}
          </div>
        </div>
      </div>
      {rows.length > 1 && <LineChart points={chartPoints(rows)} unit="kg" title="Peso corporal" goal={settings.goalWeight} />}
      <div className="row">
        <button className="btn grow" onClick={() => addMeasure('weight')}>
          <Icon name="plus" size={18} /> Registrar peso
        </button>
        <button className="btn grow" onClick={() => navigate('/body')}>
          Medidas
        </button>
      </div>
    </div>
  );
}

/* ---------- Calendario ---------- */

const WEEKS = 26;
const level = (sets: number): number => (sets <= 0 ? 0 : sets <= 12 ? 1 : sets <= 24 ? 2 : 3);

export function CalendarCard({ done }: { done: Workout[] }) {
  const now = new Date();
  const days = useMemo(() => activityByDay(done), [done]);
  const streak = useMemo(() => weekStreak(done), [done]);
  const start = weekStart(now);
  start.setDate(start.getDate() - (WEEKS - 1) * 7);
  const todayKey = dayKey(now);

  const cells: { key: string; date: Date; future: boolean }[] = [];
  const months: { week: number; label: string }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const key = dayKey(date);
      cells.push({ key, date, future: key > todayKey });
      if (d === 0 && (w === 0 || date.getDate() <= 7)) {
        const label = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(date).replace('.', '');
        if (months[months.length - 1]?.label !== label) months.push({ week: w, label });
      }
    }
  }
  const trained = cells.filter((c) => days.has(c.key)).length;

  return (
    <div className="card stack">
      <div className="row">
        <h2 className="grow">Calendario</h2>
        <span className="small muted">
          Racha: <b style={{ color: 'var(--text)' }}>{streak}</b> {streak === 1 ? 'semana' : 'semanas'}
        </span>
      </div>
      <div className="cal">
        <div className="cal-months" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }} aria-hidden="true">
          {months.map((m) => (
            <span key={`${m.week}-${m.label}`} style={{ gridColumn: m.week + 1 }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="cal-grid" role="group" aria-label={`Últimas ${WEEKS} semanas: ${trained} días con entreno`}>
          {cells.map((c) => {
            const day = days.get(c.key);
            if (c.future) return <span key={c.key} className="cal-cell future" />;
            if (!day) return <span key={c.key} className="cal-cell" />;
            const label = `${fmtDate(c.date.toISOString())}: ${day.workoutIds.length} ${day.workoutIds.length === 1 ? 'entreno' : 'entrenos'}, ${day.sets} series`;
            return (
              <button
                key={c.key}
                className={`cal-cell l${level(day.sets)}`}
                aria-label={label}
                title={label}
                onClick={() => navigate(`/history/${day.workoutIds[0]}`)}
              />
            );
          })}
        </div>
      </div>
      <div className="row small muted">
        <span className="grow">
          {trained} días con entreno en {WEEKS} semanas
        </span>
        <span>Menos series</span>
        <span className="cal-legend" aria-hidden="true">
          <i className="cal-cell l1" />
          <i className="cal-cell l2" />
          <i className="cal-cell l3" />
        </span>
        <span>Más</span>
      </div>
    </div>
  );
}

/* ---------- Series por músculo ---------- */

export function MuscleCard({ done, exercises }: { done: Workout[]; exercises: Map<string, Exercise> }) {
  const [period, setPeriod] = useState<'7d' | '28d'>('7d');
  const rows = useMemo(() => {
    const to = new Date(Date.now() + 60_000);
    const from = new Date(to.getTime() - (period === '7d' ? 7 : 28) * 86_400_000);
    const totals = muscleSets(done, exercises, from, to);
    const divisor = period === '7d' ? 1 : 4;
    return [...totals].map(([muscle, n]) => ({ muscle, value: n / divisor })).sort((a, b) => b.value - a.value);
  }, [done, exercises, period]);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const values = new Map(rows.map((r) => [r.muscle, r.value]));

  return (
    <div className="card stack">
      <h2>Series por músculo</h2>
      <div className="chips" role="group" aria-label="Periodo">
        <button className={`chip${period === '7d' ? ' on' : ''}`} aria-pressed={period === '7d'} onClick={() => setPeriod('7d')}>
          Últimos 7 días
        </button>
        <button className={`chip${period === '28d' ? ' on' : ''}`} aria-pressed={period === '28d'} onClick={() => setPeriod('28d')}>
          Media semanal (28 días)
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="empty">Sin entrenos en este periodo.</div>
      ) : (
        <div className="muscle-layout">
          <MuscleMap values={values} />
          <div className="muscle-bars">
            {rows.map((r) => (
              <div className="muscle-row" key={r.muscle}>
                <span className="name ellipsis">{r.muscle}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${(r.value / max) * 100}%` }} />
                </span>
                <span className="num">{fmt1(r.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="small muted">
        Series de trabajo (sin calentamiento). Cada ejercicio cuenta solo para su músculo principal.
      </p>
    </div>
  );
}
