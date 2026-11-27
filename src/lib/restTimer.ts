import { cancelBeep, primeAudio, scheduleBeep } from './sound';

/**
 * Temporizador de descanso. Guarda la hora de fin (no una cuenta atrás), así que
 * sigue siendo correcto aunque iOS suspenda la app o se recargue la página.
 */
export interface RestState {
  endsAt: number;
  total: number;
  label: string;
  sound: boolean;
}

const KEY = 'mfh.rest';
const listeners = new Set<() => void>();

function load(): RestState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RestState;
    // Un descanso que terminó hace más de un minuto ya no interesa.
    return typeof s.endsAt === 'number' && s.endsAt > Date.now() - 60_000 ? s : null;
  } catch {
    return null;
  }
}

let state: RestState | null = typeof localStorage === 'undefined' ? null : load();

function emit(): void {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible */
  }
  listeners.forEach((l) => l());
}

function syncBeep(): void {
  if (state?.sound) scheduleBeep((state.endsAt - Date.now()) / 1000);
  else cancelBeep();
}

export const restTimer = {
  get: (): RestState | null => state,
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  /** Debe llamarse desde un gesto del usuario para que el sonido funcione en iOS. */
  start(seconds: number, label: string, sound: boolean): void {
    if (seconds <= 0) return;
    if (sound) primeAudio();
    state = { endsAt: Date.now() + seconds * 1000, total: seconds, label, sound };
    syncBeep();
    emit();
  },
  add(deltaSec: number): void {
    if (!state) return;
    const endsAt = Math.max(Date.now(), state.endsAt + deltaSec * 1000);
    state = { ...state, endsAt, total: Math.max(1, state.total + deltaSec) };
    if (state.sound) primeAudio();
    syncBeep();
    emit();
  },
  stop(): void {
    if (!state) return;
    state = null;
    cancelBeep();
    emit();
  },
};
