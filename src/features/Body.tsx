import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, setSetting } from '../db/db';
import { MEASURES, uid, type MeasureKind, type Measurement } from '../db/schema';
import { dayKey } from '../domain/stats';
import { fmtDate, fmtDateShort, fmtNum, parseNum } from '../lib/format';
import { useSettings } from '../lib/hooks';
import { LineChart } from '../ui/charts';
import { actionSheet, confirmDialog, openSheet, promptDialog } from '../ui/dialogs';
import { Icon } from '../ui/Icon';
import { NumberInput } from '../ui/inputs';
import { Page } from '../ui/layout';

export const fmtMeasure = (kind: MeasureKind, value: number): string => `${fmtNum(value)} ${MEASURES[kind].unit}`;

export function MeasureForm({ kind, onDone }: { kind: MeasureKind; onDone: () => void }) {
  const today = dayKey(new Date());
  const [value, setValue] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(today);
  const save = async () => {
    if (value === undefined) return;
    // Hoy: la hora actual. Otro día: al mediodía, para que no cambie de día por la zona horaria.
    const when = date === today ? new Date() : new Date(`${date}T12:00:00`);
    await db.measurements.add({ id: uid(), kind, date: when.toISOString(), value });
    onDone();
  };
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="field">
        <span>
          {MEASURES[kind].label} ({MEASURES[kind].unit})
        </span>
        <NumberInput className="input" label={`${MEASURES[kind].label} en ${MEASURES[kind].unit}`} decimal value={value} onChange={setValue} />
      </label>
      <label className="field">
        <span>Fecha</span>
        <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
      </label>
      <button className="btn primary block" type="submit" disabled={value === undefined || value <= 0}>
        Guardar
      </button>
    </form>
  );
}

export const addMeasure = (kind: MeasureKind): Promise<void> =>
  openSheet(`Registrar ${MEASURES[kind].label.toLowerCase()}`, (close) => <MeasureForm kind={kind} onDone={close} />);

export function chartPoints(rows: Measurement[]) {
  return rows.map((m) => ({ date: new Date(m.date), value: m.value, label: fmtDateShort(m.date) }));
}

export function Body() {
  const [kind, setKind] = useState<MeasureKind>('weight');
  const all = useLiveQuery(() => db.measurements.toArray(), []);
  const settings = useSettings();
  const rows = useMemo(
    () => (all ?? []).filter((m) => m.kind === kind).sort((a, b) => a.date.localeCompare(b.date)),
    [all, kind],
  );

  if (!all) return <Page title="Medidas" back="/progress">{null}</Page>;

  const info = MEASURES[kind];
  const last = rows[rows.length - 1];
  const goal = kind === 'weight' ? settings.goalWeight : undefined;

  const editGoal = async () => {
    const choice = await actionSheet({
      title: 'Peso objetivo',
      actions: [
        { id: 'set', label: goal === undefined ? 'Poner un objetivo' : 'Cambiar el objetivo' },
        goal !== undefined && { id: 'clear', label: 'Quitar el objetivo', danger: true },
      ],
    });
    if (choice === 'clear') await db.settings.delete('goalWeight');
    else if (choice === 'set') {
      const text = await promptDialog({ title: 'Peso objetivo en kg', initial: goal === undefined ? '' : String(goal).replace('.', ','), placeholder: '75' });
      const n = text === undefined ? undefined : parseNum(text);
      if (n !== undefined && n > 0) await setSetting('goalWeight', n);
    }
  };

  const remove = async (m: Measurement) => {
    const ok = await confirmDialog({
      title: '¿Borrar este registro?',
      message: `${fmtMeasure(m.kind, m.value)} · ${fmtDate(m.date)}`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (ok) await db.measurements.delete(m.id);
  };

  return (
    <Page title="Medidas" back="/progress">
      <div className="chips scroll" role="group" aria-label="Qué medida ver">
        {(Object.keys(MEASURES) as MeasureKind[]).map((k) => (
          <button key={k} className={`chip${k === kind ? ' on' : ''}`} aria-pressed={k === kind} onClick={() => setKind(k)}>
            {MEASURES[k].label}
          </button>
        ))}
      </div>

      <div className="card stack">
        <div className="row">
          <div className="grow">
            <div className="small muted">{last ? `Último registro · ${fmtDate(last.date)}` : 'Sin registros'}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {last ? fmtMeasure(kind, last.value) : '—'}
            </div>
          </div>
          {kind === 'weight' && (
            <button className="chip" onClick={editGoal}>
              {goal === undefined ? 'Sin objetivo' : `Objetivo: ${fmtNum(goal)} kg`}
            </button>
          )}
        </div>
        {rows.length > 0 && <LineChart points={chartPoints(rows)} unit={info.unit} title={info.label} goal={goal} />}
        <button className="btn primary block" onClick={() => addMeasure(kind)}>
          <Icon name="plus" size={18} /> Registrar {info.label.toLowerCase()}
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <h2 className="section-title">Registros</h2>
          <div className="list">
            {[...rows].reverse().map((m) => (
              <div className="list-item" key={m.id}>
                <span className="grow">
                  <span className="title">{fmtMeasure(m.kind, m.value)}</span>
                  <span className="small muted" style={{ display: 'block' }}>
                    {fmtDate(m.date)}
                  </span>
                </span>
                <button className="icon-btn" onClick={() => remove(m)} aria-label={`Borrar el registro del ${fmtDate(m.date)}`}>
                  <Icon name="trash" size={20} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
