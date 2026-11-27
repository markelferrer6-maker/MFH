import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import type { Exercise, Workout } from '../db/schema';

/** Fuerza un render cada `ms` milisegundos y devuelve la hora actual. */
export function useNow(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, enabled]);
  return now;
}

export interface Settings {
  keepAwake: boolean;
  sound: boolean;
  defaultRest: number;
  /** Sugerir el objetivo de cada serie con doble progresión. */
  autoProgression: boolean;
  /** Calculadora de discos: peso de la barra y discos disponibles. */
  plateBar: number;
  plates: number[];
  /** Peso corporal objetivo, en kg. */
  goalWeight?: number;
  lastBackupAt?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  keepAwake: true,
  sound: true,
  defaultRest: 90,
  autoProgression: true,
  plateBar: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export function useSettings(): Settings {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  return useMemo(() => {
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows ?? []) out[r.key] = r.value;
    return out as unknown as Settings;
  }, [rows]);
}

export function useExerciseMap(): Map<string, Exercise> | undefined {
  const list = useLiveQuery(() => db.exercises.toArray(), []);
  return useMemo(() => (list ? new Map(list.map((e) => [e.id, e])) : undefined), [list]);
}

/** Entrenos terminados, del más reciente al más antiguo. */
export function useDoneWorkouts(): Workout[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.workouts.where('status').equals('done').toArray();
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, []);
}

export function useActiveWorkout(): Workout | null | undefined {
  return useLiveQuery(async () => (await db.workouts.where('status').equals('active').first()) ?? null, []);
}

/** Mantiene la pantalla encendida mientras `enabled` sea true y la app esté visible. */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        /* el sistema lo ha denegado (por ejemplo, batería baja) */
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, [enabled]);
}
