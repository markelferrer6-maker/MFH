import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { clock } from '../lib/format';
import { useActiveWorkout, useNow } from '../lib/hooks';
import { restTimer } from '../lib/restTimer';
import { goBack, navigate } from '../lib/router';
import { Icon, type IconName } from './Icon';

export function Page({
  title,
  back,
  onBack,
  right,
  children,
}: {
  title: ReactNode;
  /** Ruta a la que volver si no hay historial dentro de la app. Si se indica, se muestra la flecha. */
  back?: string;
  /** Sustituye el comportamiento de la flecha (por ejemplo, para avisar de cambios sin guardar). */
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className={`topbar${back ? ' sub' : ''}`}>
        {back && (
          <button className="icon-btn back" onClick={onBack ?? (() => goBack(back))} aria-label="Volver">
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
        <div className="topbar-right">{right}</div>
      </header>
      <main className="content">{children}</main>
    </>
  );
}

const TABS: { path: string; key: string | undefined; label: string; icon: IconName }[] = [
  { path: '/', key: undefined, label: 'Inicio', icon: 'home' },
  { path: '/history', key: 'history', label: 'Historial', icon: 'history' },
  { path: '/progress', key: 'progress', label: 'Progreso', icon: 'chart' },
  { path: '/settings', key: 'settings', label: 'Ajustes', icon: 'settings' },
];

function TabBar({ current }: { current: string | undefined }) {
  return (
    <nav className="tabbar" aria-label="Secciones">
      {TABS.map((t) => (
        <button
          key={t.path}
          className="tab"
          aria-current={current === t.key ? 'page' : undefined}
          onClick={() => navigate(t.path, { replace: true })}
        >
          <Icon name={t.icon} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function RestBar() {
  const rest = useSyncExternalStore(restTimer.subscribe, restTimer.get);
  const now = useNow(250, rest !== null);
  const remaining = rest ? (rest.endsAt - now) / 1000 : 0;
  const finished = rest !== null && remaining <= 0;

  // Terminado: se deja el aviso unos segundos y luego se retira solo.
  useEffect(() => {
    if (!finished) return;
    if ('vibrate' in navigator) navigator.vibrate?.([200, 100, 200]);
    const id = window.setTimeout(() => restTimer.stop(), 6000);
    return () => window.clearTimeout(id);
  }, [finished]);

  if (!rest) return null;
  const pct = finished ? 100 : Math.min(100, Math.max(0, (1 - remaining / rest.total) * 100));
  return (
    <div className={`floatbar restbar${finished ? ' finished' : ''}`} role="timer" aria-label="Descanso">
      <div className="time">{finished ? '¡Ya!' : clock(Math.ceil(remaining))}</div>
      <div className="grow">
        <div className="title">{finished ? 'Descanso terminado' : 'Descanso'}</div>
        <div className="small">{rest.label}</div>
      </div>
      {!finished && (
        <>
          <button className="btn sm" onClick={() => restTimer.add(-15)} aria-label="Quitar 15 segundos">
            −15
          </button>
          <button className="btn sm" onClick={() => restTimer.add(15)} aria-label="Añadir 15 segundos">
            +15
          </button>
        </>
      )}
      <button className="btn sm" onClick={() => restTimer.stop()}>
        {finished ? 'Cerrar' : 'Saltar'}
      </button>
      <div className="progress" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ActiveBar() {
  const active = useActiveWorkout();
  const now = useNow(1000, Boolean(active));
  if (!active) return null;
  return (
    <button className="floatbar" onClick={() => navigate('/workout')} style={{ textAlign: 'left' }}>
      <Icon name="play" />
      <span className="grow">
        <span className="title" style={{ display: 'block' }}>
          {active.name}
        </span>
        <span className="small">Entreno en curso · {clock((now - Date.parse(active.startedAt)) / 1000)}</span>
      </span>
      <span className="btn sm primary">Continuar</span>
    </button>
  );
}

/** Barras fijas de abajo: descanso, entreno en curso y pestañas. */
export function BottomBars({ section, tabs }: { section: string | undefined; tabs: boolean }) {
  return (
    <div className={`bottom${tabs ? '' : ' no-tabs'}`}>
      <div className="bottom-inner">
        <RestBar />
        {section !== 'workout' && <ActiveBar />}
        {tabs && <TabBar current={section} />}
      </div>
    </div>
  );
}
