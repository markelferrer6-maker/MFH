import { useState } from 'react';
import body from '../data/bodyMap.json';
import { fmt1 } from '../lib/format';

/**
 * Figura humana (frente y espalda) con cada grupo muscular coloreado según su valor.
 * Los trazados son de react-native-body-highlighter (MIT); ver src/data/bodyMap.LICENSE.
 * Es un apoyo visual: los números exactos van siempre en la lista de barras.
 */
interface Region {
  slug: string;
  paths: string[];
}

const DATA = body as {
  viewBox: { front: string; back: string };
  outline: { front: string; back: string };
  front: Region[];
  back: Region[];
};

/**
 * Qué grupos musculares de la app pinta cada zona del dibujo. El dibujo no separa
 * dorsales de espalda alta ni tiene abductores (glúteo medio y menor), así que esas
 * zonas suman dos grupos.
 */
export const REGION_MUSCLES: Record<string, string[]> = {
  chest: ['Pecho'],
  abs: ['Abdominales'],
  obliques: ['Abdominales'],
  biceps: ['Bíceps'],
  triceps: ['Tríceps'],
  forearm: ['Antebrazos'],
  deltoids: ['Hombros'],
  trapezius: ['Trapecios'],
  neck: ['Cuello'],
  'upper-back': ['Dorsales', 'Espalda alta'],
  'lower-back': ['Lumbares'],
  gluteal: ['Glúteos', 'Abductores'],
  hamstring: ['Isquios'],
  quadriceps: ['Cuádriceps'],
  calves: ['Gemelos'],
  adductors: ['Aductores'],
};

/** Slugs presentes en el dibujo, para comprobar en las pruebas que la tabla es coherente. */
export const BODY_SLUGS = new Set([...DATA.front, ...DATA.back].map((r) => r.slug));

function Figure({
  side,
  regionValue,
  max,
  selected,
  onSelect,
  label,
}: {
  side: 'front' | 'back';
  regionValue: (slug: string) => number;
  max: number;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  label: string;
}) {
  const fill = (slug: string): string | undefined => {
    if (!(slug in REGION_MUSCLES)) return undefined; // cabeza, manos, pies...: color de la silueta
    const v = regionValue(slug);
    if (v <= 0 || max <= 0) return 'var(--map-empty)';
    const pct = Math.round(30 + 70 * (v / max));
    return `color-mix(in srgb, var(--accent) ${pct}%, var(--map-empty))`;
  };
  return (
    <figure className="muscle-fig">
      <svg viewBox={DATA.viewBox[side]} aria-hidden="true">
        <path className="body-outline" d={DATA.outline[side]} />
        {DATA[side].map((region) => {
          const muscle = region.slug in REGION_MUSCLES;
          return (
            <g
              key={region.slug}
              className={`${muscle ? 'muscle' : 'body-part'}${selected === region.slug ? ' selected' : ''}`}
              style={{ fill: fill(region.slug) }}
              onClick={muscle ? () => onSelect(selected === region.slug ? null : region.slug) : undefined}
            >
              {region.paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function MuscleMap({ values, unit }: { values: Map<string, number>; unit: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const regionValue = (slug: string): number =>
    (REGION_MUSCLES[slug] ?? []).reduce((sum, m) => sum + (values.get(m) ?? 0), 0);
  const max = Math.max(0, ...Object.keys(REGION_MUSCLES).map(regionValue));
  const names = selected ? REGION_MUSCLES[selected].join(' + ') : null;

  return (
    <div className="muscle-map-wrap">
      <div className="muscle-map">
        <Figure side="front" regionValue={regionValue} max={max} selected={selected} onSelect={setSelected} label="Delante" />
        <Figure side="back" regionValue={regionValue} max={max} selected={selected} onSelect={setSelected} label="Detrás" />
      </div>
      <p className="small muted muscle-hint" role="status">
        {selected && names ? (
          <>
            <b>{names}</b>: {fmt1(regionValue(selected))} {unit}
          </>
        ) : (
          'Toca un músculo para ver sus series.'
        )}
      </p>
    </div>
  );
}
