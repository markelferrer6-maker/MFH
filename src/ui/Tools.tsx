import { useState } from 'react';
import { setSetting } from '../db/db';
import type { ExerciseType, Progression } from '../db/schema';
import { ALL_PLATES, BARS, platesPerSide } from '../domain/plates';
import { DEFAULT_INCREMENT, DEFAULT_RANGE, INCREMENTS } from '../domain/progression';
import { STALL_SESSIONS } from '../domain/stats';
import { fmtNum } from '../lib/format';
import { useSettings } from '../lib/hooks';
import { NumberInput } from './inputs';

const kg = (n: number): string => String(n).replace('.', ',');

/** Ajuste de la doble progresión de un ejercicio. */
export function ProgressionForm({
  value,
  type,
  onSave,
}: {
  value: Progression | null | undefined;
  type: ExerciseType;
  onSave: (p: Progression | null) => void;
}) {
  const [repMin, setRepMin] = useState(value?.repMin ?? 8);
  const [repMax, setRepMax] = useState(value?.repMax ?? (value?.repMin ?? 8) + DEFAULT_RANGE);
  const [increment, setIncrement] = useState(value?.increment ?? DEFAULT_INCREMENT);
  const top = Math.max(repMin, repMax);

  if (type === 'reps') {
    return (
      <div className="stack">
        <p className="sheet-msg">
          En ejercicios sin peso, el objetivo de cada serie es hacer una repetición más que la última vez.
        </p>
        <button className="btn primary block" onClick={() => onSave({ repMin, repMax: top, increment })}>
          Activar progresión
        </button>
        <button className="btn block" onClick={() => onSave(null)}>
          Sin progresión
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="sheet-msg">
        Trabajas en un rango de repeticiones. Cada serie avanza por su cuenta: si la última vez llegaste al máximo,
        hoy sube el peso; si no, mismo peso y una repetición más.
      </p>
      <div className="row">
        <label className="field grow">
          <span>Reps mínimas</span>
          <select className="select" value={repMin} onChange={(e) => setRepMin(Number(e.target.value))}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span>Reps máximas</span>
          <select className="select" value={top} onChange={(e) => setRepMax(Number(e.target.value))}>
            {Array.from({ length: 41 - repMin }, (_, i) => i + repMin).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Cuánto subir el peso</span>
        <div className="chips" role="group" aria-label="Cuánto subir el peso">
          {INCREMENTS.map((n) => (
            <button key={n} className={`chip${n === increment ? ' on' : ''}`} aria-pressed={n === increment} onClick={() => setIncrement(n)}>
              +{kg(n)} kg
            </button>
          ))}
        </div>
      </div>
      <p className="small muted">
        Con esto: al hacer {top} repeticiones en una serie, la próxima vez serán {kg(increment)} kg más y {repMin}{' '}
        repeticiones.
      </p>
      <button className="btn primary block" onClick={() => onSave({ repMin, repMax: top, increment })}>
        Guardar
      </button>
      <button className="btn block" onClick={() => onSave(null)}>
        Sin progresión en este ejercicio
      </button>
    </div>
  );
}

export function StallInfo({ sessions, name }: { sessions: number; name: string }) {
  return (
    <div className="stack">
      <p>
        Llevas <b>{sessions} sesiones</b> de {name} sin superar tu mejor marca (se avisa a partir de {STALL_SESSIONS}).
      </p>
      <p className="sheet-msg">
        Es normal que pase. Una pauta habitual es una descarga: baja el peso alrededor de un 10 % durante una o dos
        sesiones, haz las repeticiones con margen y vuelve a subir. También ayuda revisar el descanso, el sueño y si
        estás comiendo suficiente. Es una orientación general, no un consejo personalizado.
      </p>
    </div>
  );
}

const PLATE_HEIGHT: Record<number, number> = { 25: 64, 20: 60, 15: 52, 10: 44, 5: 34, 2.5: 26, 1.25: 20 };

/** Qué discos poner en cada lado de la barra. */
export function PlateCalculator({ initial }: { initial?: number }) {
  const settings = useSettings();
  const [target, setTarget] = useState<number | undefined>(initial);
  const bar = settings.plateBar;
  const available = settings.plates;
  const result = target !== undefined ? platesPerSide(target, bar, available) : null;

  const togglePlate = (p: number) => {
    const next = available.includes(p) ? available.filter((x) => x !== p) : [...available, p];
    void setSetting('plates', next.sort((a, b) => b - a));
  };

  return (
    <div className="stack">
      <label className="field">
        <span>Peso total que quieres levantar (kg)</span>
        <NumberInput className="input" label="Peso total en kg" decimal value={target} onChange={setTarget} />
      </label>

      {result && target !== undefined && (
        <div className="card stack" role="status">
          {target < bar ? (
            <p>Ese peso es menor que la barra ({kg(bar)} kg).</p>
          ) : (
            <>
              <div>
                <div className="small muted">En cada lado</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>
                  {result.perSide.length > 0 ? result.perSide.map(kg).join(' + ') : 'Solo la barra'}
                </div>
              </div>
              {result.perSide.length > 0 && (
                <svg viewBox="0 0 320 80" width="100%" aria-hidden="true">
                  <rect x="0" y="36" width="320" height="8" rx="4" fill="var(--border)" />
                  <rect x="20" y="30" width="8" height="20" rx="2" fill="var(--muted)" />
                  {result.perSide.map((p, i) => {
                    const h = PLATE_HEIGHT[p] ?? 30;
                    return <rect key={i} x={32 + i * 18} y={40 - h / 2} width="15" height={h} rx="3" fill="var(--series-1)" />;
                  })}
                </svg>
              )}
              <p className="small muted">
                Total: {fmtNum(result.total)} kg con barra de {kg(bar)} kg.
                {result.missing > 0 && ` Faltan ${fmtNum(result.missing)} kg: con estos discos no se llega exacto.`}
              </p>
            </>
          )}
        </div>
      )}

      <div className="field">
        <span>Barra</span>
        <div className="chips" role="group" aria-label="Peso de la barra">
          {BARS.map((b) => (
            <button key={b} className={`chip${b === bar ? ' on' : ''}`} aria-pressed={b === bar} onClick={() => setSetting('plateBar', b)}>
              {kg(b)} kg
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Discos que hay en tu gimnasio</span>
        <div className="chips" role="group" aria-label="Discos disponibles">
          {ALL_PLATES.map((p) => (
            <button key={p} className={`chip${available.includes(p) ? ' on' : ''}`} aria-pressed={available.includes(p)} onClick={() => togglePlate(p)}>
              {kg(p)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
