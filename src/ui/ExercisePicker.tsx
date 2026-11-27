import { useMemo, useState } from 'react';
import { db } from '../db/db';
import { MUSCLES, TYPE_LABELS, uid, type Exercise, type ExerciseType } from '../db/schema';
import { catalogNotInLibrary, exerciseFromCatalog, type CatalogEntry } from '../lib/catalog';
import { Sheet } from './dialogs';
import { ExerciseThumbImage } from './ExerciseHelp';
import { Icon } from './Icon';

/** Quita acentos y mayúsculas para buscar "biceps" y encontrar "Bíceps". */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function ExerciseForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Exercise;
  submitLabel: string;
  onSubmit: (data: { name: string; muscle: string; type: ExerciseType }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [muscle, setMuscle] = useState(initial?.muscle ?? 'Pecho');
  const [type, setType] = useState<ExerciseType>(initial?.type ?? 'weight_reps');
  const muscles = MUSCLES.includes(muscle as (typeof MUSCLES)[number]) ? MUSCLES : [muscle, ...MUSCLES];
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit({ name: name.trim(), muscle, type });
      }}
    >
      <label className="field">
        <span>Nombre</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Press inclinado (Mancuerna)" />
      </label>
      <label className="field">
        <span>Grupo muscular</span>
        <select className="select" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          {muscles.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Qué se registra</span>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as ExerciseType)}>
          {(Object.keys(TYPE_LABELS) as ExerciseType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <button className="btn primary block" type="submit" disabled={!name.trim()}>
        {submitLabel}
      </button>
    </form>
  );
}

export function ExercisePicker({
  exercises,
  usage,
  title,
  onPick,
  onClose,
}: {
  exercises: Exercise[];
  /** Veces que se ha usado cada ejercicio; los más usados salen primero. */
  usage: Map<string, number>;
  title: string;
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const catalog = useMemo(() => catalogNotInLibrary(exercises), [exercises]);
  const muscles = useMemo(
    () => [...new Set([...exercises, ...catalog].map((e) => e.muscle))].sort((a, b) => a.localeCompare(b, 'es')),
    [exercises, catalog],
  );
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return exercises
      .filter((e) => (!muscle || e.muscle === muscle) && (!q || fold(e.name).includes(q)))
      .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'es'));
  }, [exercises, usage, query, muscle]);
  const shownCatalog = useMemo(() => {
    const q = fold(query.trim());
    return catalog.filter((c) => (!muscle || c.muscle === muscle) && (!q || fold(c.name).includes(q)));
  }, [catalog, query, muscle]);

  const pickFromCatalog = async (entry: CatalogEntry) => {
    const id = uid();
    await db.exercises.add(exerciseFromCatalog(entry, id));
    onPick(id);
  };

  if (creating) {
    return (
      <Sheet title="Nuevo ejercicio" onClose={() => setCreating(false)}>
        <ExerciseForm
          submitLabel="Crear y añadir"
          onSubmit={async (data) => {
            const id = uid();
            await db.exercises.add({ id, ...data, custom: true });
            onPick(id);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title={title} onClose={onClose} full>
      <label className="search">
        <Icon name="search" size={20} />
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ejercicio"
          aria-label="Buscar ejercicio"
        />
      </label>
      <div className="chips scroll">
        <button className={`chip${muscle === null ? ' on' : ''}`} onClick={() => setMuscle(null)}>
          Todos
        </button>
        {muscles.map((m) => (
          <button key={m} className={`chip${muscle === m ? ' on' : ''}`} onClick={() => setMuscle(m)}>
            {m}
          </button>
        ))}
      </div>
      {shown.length > 0 && shownCatalog.length > 0 && <h3 className="section-title">Tus ejercicios</h3>}
      {(shown.length > 0 || shownCatalog.length === 0) && (
        <div className="list">
          {shown.map((e) => (
            <button key={e.id} className="list-item" onClick={() => onPick(e.id)}>
              <ExerciseThumbImage exercise={e} />
              <span className="grow">
                <span className="title ellipsis" style={{ display: 'block' }}>
                  {e.name}
                </span>
                <span className="small muted">{e.muscle}</span>
              </span>
            </button>
          ))}
          {shown.length === 0 && shownCatalog.length === 0 && <div className="empty">Ningún ejercicio coincide.</div>}
        </div>
      )}
      {shownCatalog.length > 0 && (
        <>
          <h3 className="section-title">Catálogo de máquinas</h3>
          <div className="list">
            {shownCatalog.map((c) => (
              <button key={c.id} className="list-item" onClick={() => pickFromCatalog(c)}>
                <ExerciseThumbImage exercise={{ catalogId: c.id }} />
                <span className="grow">
                  <span className="title ellipsis" style={{ display: 'block' }}>
                    {c.name}
                  </span>
                  <span className="small muted">{c.muscle}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <button className="btn block" onClick={() => setCreating(true)}>
        <Icon name="plus" size={18} /> Crear ejercicio nuevo
      </button>
    </Sheet>
  );
}
