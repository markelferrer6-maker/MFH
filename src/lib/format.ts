import { TYPE_FIELDS, type ExerciseType, type SetValues } from '../db/schema';

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export const fmtNum = (n: number): string => nf.format(n);
export const fmtInt = (n: number): string => nf0.format(n);
export const fmt1 = (n: number): string => nf1.format(n);

/** Acepta "72,5" y "72.5". Devuelve undefined si está vacío o no es un número válido. */
export function parseNum(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** 95 → "1:35" */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 4011 → "1 h 7 min" */
export function fmtDuration(totalSec: number): string {
  const min = Math.round(totalSec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const dateYearFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

export function fmtDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() ? dateFmt.format(d) : dateYearFmt.format(d);
}
export const fmtDateShort = (d: Date | string): string => shortFmt.format(typeof d === 'string' ? new Date(d) : d);
export const fmtTime = (iso: string): string => timeFmt.format(new Date(iso));
export const fmtMonth = (iso: string): string => {
  const s = monthFmt.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Días naturales entre dos fechas (en hora local). */
export function daysBetween(fromIso: string, to = new Date()): number {
  const a = new Date(fromIso);
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const b0 = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b0 - a0) / 86_400_000);
}

export function relDay(iso: string, now = new Date()): string {
  const d = daysBetween(iso, now);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 14) return `hace ${d} días`;
  if (d < 60) return `hace ${Math.round(d / 7)} semanas`;
  return `hace ${Math.round(d / 30)} meses`;
}

/** "70 kg × 8", "5 reps", "0:45", "2 km en 7:00". Con `compact`, "70 × 8" para columnas estrechas. */
export function setSummary(s: SetValues, type: ExerciseType, compact = false): string {
  const has = (k: keyof SetValues) => TYPE_FIELDS[type].includes(k) && s[k] !== undefined;
  const parts: string[] = [];
  if (has('weightKg') && has('reps')) parts.push(`${fmtNum(s.weightKg!)}${compact ? '' : ' kg'} × ${fmtInt(s.reps!)}`);
  else if (has('weightKg')) parts.push(`${fmtNum(s.weightKg!)} kg`);
  else if (has('reps')) parts.push(`${fmtInt(s.reps!)} reps`);
  if (has('distanceM')) {
    parts.push(s.distanceM! >= 1000 ? `${fmtNum(s.distanceM! / 1000)} km` : `${fmtInt(s.distanceM!)} m`);
  }
  if (has('durationSec')) parts.push(clock(s.durationSec!));
  return parts.length > 0 ? parts.join(' en ') : '—';
}

/** <input type="datetime-local"> usa hora local sin zona: "2026-11-25T16:44". */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
