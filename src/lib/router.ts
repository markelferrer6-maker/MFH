import { useSyncExternalStore } from 'react';

/**
 * Rutas con hash (#/history): GitHub Pages no reescribe rutas de una SPA.
 * Cada entrada del historial guarda su profundidad en history.state, para saber
 * si "atrás" puede volver dentro de la app o hay que ir a una pantalla concreta.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getPath = () => window.location.hash.replace(/^#/, '') || '/';
const depth = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

export function useRoute(): string[] {
  return useSyncExternalStore(subscribe, getPath).split('/').filter(Boolean);
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState({ idx: depth() }, '', `#${path}`);
  else window.history.pushState({ idx: depth() + 1 }, '', `#${path}`);
  window.scrollTo(0, 0);
  notify();
}

/** Vuelve atrás; si la app se abrió directamente en esta pantalla, va a `fallback`. */
export function goBack(fallback = '/'): void {
  if (depth() > 0) window.history.back();
  else navigate(fallback, { replace: true });
}
