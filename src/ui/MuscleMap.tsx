import type { ReactNode } from 'react';

/**
 * Figura esquemática (delante y detrás) con cada grupo muscular coloreado según su valor.
 * Es un apoyo visual: los números exactos van siempre en la lista de al lado.
 */
type Shape =
  | { muscle: string; kind: 'rect'; x: number; y: number; w: number; h: number; r?: number }
  | { muscle: string; kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { muscle: string; kind: 'poly'; points: string };

const pair = (muscle: string, x: number, y: number, w: number, h: number, r = 4): Shape[] => [
  { muscle, kind: 'rect', x, y, w, h, r },
  { muscle, kind: 'rect', x: 100 - x - w, y, w, h, r },
];
const pairEllipse = (muscle: string, cx: number, cy: number, rx: number, ry: number): Shape[] => [
  { muscle, kind: 'ellipse', cx, cy, rx, ry },
  { muscle, kind: 'ellipse', cx: 100 - cx, cy, rx, ry },
];

const ARMS: Shape[] = [...pair('Antebrazos', 17.5, 77, 11, 30)];

const FRONT: Shape[] = [
  { muscle: 'Cuello', kind: 'rect', x: 45, y: 25, w: 10, h: 7, r: 2 },
  ...pairEllipse('Hombros', 26, 40, 8, 7),
  ...pair('Pecho', 33, 36, 16, 17),
  ...pair('Bíceps', 17.5, 49, 11, 25),
  ...ARMS,
  { muscle: 'Abdominales', kind: 'rect', x: 39, y: 56, w: 22, h: 42, r: 5 },
  ...pairEllipse('Abductores', 33, 108, 4, 9),
  ...pair('Cuádriceps', 34, 118, 12, 44, 5),
  ...pair('Aductores', 46.5, 118, 3, 26, 1.5),
];

const BACK: Shape[] = [
  { muscle: 'Trapecios', kind: 'poly', points: '38,33 62,33 57,47 43,47' },
  ...pairEllipse('Hombros', 26, 40, 8, 7),
  { muscle: 'Espalda alta', kind: 'rect', x: 36, y: 48, w: 28, h: 12, r: 3 },
  ...pair('Dorsales', 32, 62, 15, 26),
  { muscle: 'Lumbares', kind: 'rect', x: 42, y: 90, w: 16, h: 13, r: 3 },
  ...pair('Tríceps', 17.5, 49, 11, 25),
  ...ARMS,
  ...pairEllipse('Glúteos', 41, 111, 8, 9),
  ...pair('Isquios', 34, 123, 12, 39, 5),
  ...pair('Gemelos', 35, 166, 10, 27, 5),
];

/** Músculos que aparecen en la figura (el resto solo se ve en la lista). */
export const MAPPED_MUSCLES = new Set([...FRONT, ...BACK].map((s) => s.muscle));

function Silhouette() {
  return (
    <g className="body-base">
      <circle cx="50" cy="15" r="10" />
      <rect x="45" y="24" width="10" height="9" rx="2" />
      <rect x="29" y="32" width="42" height="74" rx="11" />
      <rect x="17" y="34" width="12" height="86" rx="6" />
      <rect x="71" y="34" width="12" height="86" rx="6" />
      <rect x="31" y="98" width="38" height="24" rx="9" />
      <rect x="33" y="112" width="14" height="90" rx="7" />
      <rect x="53" y="112" width="14" height="90" rx="7" />
    </g>
  );
}

function Figure({ shapes, values, max, label }: { shapes: Shape[]; values: Map<string, number>; max: number; label: string }) {
  const fill = (muscle: string): string => {
    const v = values.get(muscle) ?? 0;
    if (v <= 0 || max <= 0) return 'var(--map-empty)';
    const pct = Math.round(25 + 75 * (v / max));
    return `color-mix(in srgb, var(--series-1) ${pct}%, var(--map-empty))`;
  };
  return (
    <figure className="muscle-fig">
      <svg viewBox="0 0 100 206" aria-hidden="true">
        <Silhouette />
        {shapes.map((s, i): ReactNode => {
          const style = { fill: fill(s.muscle) };
          if (s.kind === 'rect') return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r ?? 4} style={style} />;
          if (s.kind === 'ellipse') return <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} style={style} />;
          return <polygon key={i} points={s.points} style={style} />;
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function MuscleMap({ values }: { values: Map<string, number> }) {
  const max = Math.max(0, ...[...values].filter(([m]) => MAPPED_MUSCLES.has(m)).map(([, v]) => v));
  return (
    <div className="muscle-map">
      <Figure shapes={FRONT} values={values} max={max} label="Delante" />
      <Figure shapes={BACK} values={values} max={max} label="Detrás" />
    </div>
  );
}
