import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { fmt1 } from '../lib/format';

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Marcas redondas para el eje (1, 2, 2,5, 5 × 10^n), unas `target` como mucho. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (max <= min) {
    const step = min === 0 ? 1 : Math.pow(10, Math.floor(Math.log10(Math.abs(min))));
    return [min - step, min, min + step].filter((v) => v >= 0);
  }
  const raw = (max - min) / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const first = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = first; v < max + step * 0.999; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export interface LinePoint {
  date: Date;
  value: number;
  /** Texto corto de la fecha, para el eje y la etiqueta emergente. */
  label: string;
}

const H = 190;
const M = { top: 22, right: 14, bottom: 22, left: 40 };

/** Evolución de una sola métrica a lo largo del tiempo. */
export function LineChart({
  points,
  unit,
  title,
  goal,
}: {
  points: LinePoint[];
  unit: string;
  title: string;
  /** Valor objetivo: se dibuja como línea de referencia. */
  goal?: number;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const fmt = (v: number) => `${fmt1(v)}${unit === 'kg' ? ' kg' : unit ? ` ${unit}` : ''}`;

  const values = [...points.map((p) => p.value), ...(goal !== undefined ? [goal] : [])];
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const t0 = points[0].date.getTime();
  const t1 = points[points.length - 1].date.getTime();
  const iw = Math.max(1, width - M.left - M.right);
  const ih = H - M.top - M.bottom;
  const x = (p: LinePoint) => M.left + (t1 === t0 ? iw / 2 : ((p.date.getTime() - t0) / (t1 - t0)) * iw);
  const y = (v: number) => M.top + (y1 === y0 ? ih / 2 : (1 - (v - y0) / (y1 - y0)) * ih);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const area = `${path} L${x(last).toFixed(1)},${M.top + ih} L${x(points[0]).toFixed(1)},${M.top + ih} Z`;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i]) - px) < Math.abs(x(points[best]) - px)) best = i;
    }
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;
  const endAnchor = x(last) > width - 60 ? 'end' : 'middle';

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          height={H}
          role="img"
          aria-label={`${title}: de ${fmt(points[0].value)} (${points[0].label}) a ${fmt(last.value)} (${last.label})`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={M.left - 6} y={y(t) + 4} textAnchor="end">
                {fmt1(t)}
              </text>
            </g>
          ))}
          {goal !== undefined && (
            <g>
              <line className="goal" x1={M.left} x2={width - M.right} y1={y(goal)} y2={y(goal)} />
              <text className="tick" x={M.left + 4} y={y(goal) - 4} textAnchor="start">
                Objetivo {fmt(goal)}
              </text>
            </g>
          )}
          <text className="tick" x={M.left} y={H - 4} textAnchor="start">
            {points[0].label}
          </text>
          {points.length > 1 && (
            <text className="tick" x={width - M.right} y={H - 4} textAnchor="end">
              {last.label}
            </text>
          )}
          {points.length > 1 && <path className="area" d={area} />}
          <path className="line" d={path} />
          {points.length <= 12 &&
            points.slice(0, -1).map((p, i) => <circle key={i} className="dot" cx={x(p)} cy={y(p.value)} r={4} />)}
          <circle className="dot" cx={x(last)} cy={y(last.value)} r={5} />
          {hover === null && (
            <text className="value-label" x={x(last)} y={y(last.value) - 10} textAnchor={endAnchor}>
              {fmt(last.value)}
            </text>
          )}
          {hp && (
            <>
              <line className="cross" x1={x(hp)} x2={x(hp)} y1={M.top} y2={M.top + ih} />
              <circle className="dot" cx={x(hp)} cy={y(hp.value)} r={6} />
            </>
          )}
        </svg>
      )}
      {hp && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hp), 50), width - 50) }}>
          <b>{fmt(hp.value)}</b>
          {hp.label}
        </div>
      )}
    </div>
  );
}

export interface Bar {
  key: string;
  value: number;
  /** Etiqueta del eje (puede ir vacía para no saturar). */
  axis: string;
  /** Descripción completa para la etiqueta emergente. */
  label: string;
}

/** Columnas de una sola serie (por ejemplo, entrenos por semana). */
export function BarChart({ bars, title, unitOne, unitMany }: { bars: Bar[]; title: string; unitOne: string; unitMany: string }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const h = 150;
  const m = { top: 12, right: 6, bottom: 22, left: 26 };
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, max, 3).filter((t) => Number.isInteger(t));
  const top = ticks[ticks.length - 1];
  const iw = Math.max(1, width - m.left - m.right);
  const ih = h - m.top - m.bottom;
  const band = iw / bars.length;
  const bw = Math.min(24, Math.max(4, band - 2));
  const yv = (v: number) => m.top + (1 - v / top) * ih;
  const count = (v: number) => `${v} ${v === 1 ? unitOne : unitMany}`;
  const ab = active !== null ? bars[active] : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg height={h} role="img" aria-label={`${title}. ${bars.map((b) => `${b.label}: ${count(b.value)}`).join('; ')}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={m.left} x2={width - m.right} y1={yv(t)} y2={yv(t)} />
              <text className="tick" x={m.left - 6} y={yv(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = m.left + band * i + band / 2;
            const bh = (b.value / top) * ih;
            const r = Math.min(4, bh);
            const x0 = cx - bw / 2;
            const yTop = m.top + ih - bh;
            const d = `M${x0},${m.top + ih} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + bw - r} Q${x0 + bw},${yTop} ${x0 + bw},${yTop + r} V${m.top + ih} Z`;
            return (
              <g key={b.key}>
                {b.value > 0 && <path className={`bar${active !== null && active !== i ? ' dim' : ''}`} d={d} />}
                {b.axis && (
                  <text className="tick" x={cx} y={h - 4} textAnchor="middle">
                    {b.axis}
                  </text>
                )}
                <rect
                  x={m.left + band * i}
                  y={0}
                  width={band}
                  height={h}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {ab && active !== null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(m.left + band * active + band / 2, 60), width - 60) }}>
          <b>{count(ab.value)}</b>
          {ab.label}
        </div>
      )}
    </div>
  );
}
