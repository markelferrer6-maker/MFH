import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Hoja inferior modal. */
export function Sheet({
  title,
  onClose,
  children,
  full = false,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${full ? ' full' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/* ---- Diálogos imperativos: `await confirmDialog(...)` desde cualquier sitio ---- */

export interface Action<T extends string = string> {
  id: T;
  label: string;
  icon?: IconName;
  danger?: boolean;
  selected?: boolean;
}

type Request =
  | {
      kind: 'confirm';
      title: string;
      message?: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
      resolve: (ok: boolean) => void;
    }
  | { kind: 'content'; title: string; content: SheetContent; resolve: () => void }
  | { kind: 'actions'; title: string; actions: Action[]; grid: boolean; resolve: (id: string | undefined) => void }
  | {
      kind: 'prompt';
      title: string;
      initial: string;
      placeholder?: string;
      confirmLabel: string;
      resolve: (text: string | undefined) => void;
    };

let queue: Request[] = [];
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
function push(r: Request) {
  queue = [...queue, r];
  listeners.forEach((l) => l());
}
function shift() {
  queue = queue.slice(1);
  listeners.forEach((l) => l());
}

export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) =>
    push({
      kind: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Aceptar',
      cancelLabel: opts.cancelLabel ?? 'Cancelar',
      danger: opts.danger ?? false,
      resolve,
    }),
  );
}

export function actionSheet<T extends string>(opts: {
  title: string;
  actions: (Action<T> | false | undefined)[];
  grid?: boolean;
}): Promise<T | undefined> {
  return new Promise((resolve) =>
    push({
      kind: 'actions',
      title: opts.title,
      actions: opts.actions.filter((a): a is Action<T> => Boolean(a)),
      grid: opts.grid ?? false,
      resolve: resolve as (id: string | undefined) => void,
    }),
  );
}

/** Contenido de una hoja: fijo, o una función que recibe cómo cerrarla (para formularios). */
export type SheetContent = ReactNode | ((close: () => void) => ReactNode);

/** Abre una hoja con contenido libre (por ejemplo, las fotos de un ejercicio). */
export function openSheet(title: string, content: SheetContent): Promise<void> {
  return new Promise((resolve) => push({ kind: 'content', title, content, resolve }));
}

export function promptDialog(opts: {
  title: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | undefined> {
  return new Promise((resolve) =>
    push({
      kind: 'prompt',
      title: opts.title,
      initial: opts.initial ?? '',
      placeholder: opts.placeholder,
      confirmLabel: opts.confirmLabel ?? 'Guardar',
      resolve,
    }),
  );
}

function PromptBody({ req, done }: { req: Extract<Request, { kind: 'prompt' }>; done: (v: string | undefined) => void }) {
  const [text, setText] = useState(req.initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) done(text.trim());
      }}
    >
      <input
        ref={ref}
        className="input"
        value={text}
        placeholder={req.placeholder}
        onChange={(e) => setText(e.target.value)}
        aria-label={req.title}
      />
      <button className="btn primary block" type="submit" disabled={!text.trim()}>
        {req.confirmLabel}
      </button>
    </form>
  );
}

/** Se monta una vez en la raíz de la app. */
export function DialogHost() {
  const req = useSyncExternalStore(subscribe, () => queue[0]);
  if (!req) return null;
  const finish = (value: unknown) => {
    shift();
    (req.resolve as (v: unknown) => void)(value);
  };
  if (req.kind === 'confirm') {
    return (
      <Sheet title={req.title} onClose={() => finish(false)}>
        {req.message && <p className="sheet-msg">{req.message}</p>}
        <button className={`btn block ${req.danger ? 'danger' : 'primary'}`} onClick={() => finish(true)}>
          {req.confirmLabel}
        </button>
        <button className="btn block" onClick={() => finish(false)}>
          {req.cancelLabel}
        </button>
      </Sheet>
    );
  }
  if (req.kind === 'content') {
    return (
      <Sheet title={req.title} onClose={() => finish(undefined)}>
        {typeof req.content === 'function' ? req.content(() => finish(undefined)) : req.content}
      </Sheet>
    );
  }
  if (req.kind === 'prompt') {
    return (
      <Sheet title={req.title} onClose={() => finish(undefined)}>
        <PromptBody req={req} done={finish} />
      </Sheet>
    );
  }
  return (
    <Sheet title={req.title} onClose={() => finish(undefined)}>
      <div className={req.grid ? 'action-grid' : 'stack'}>
        {req.actions.map((a) => (
          <button
            key={a.id}
            className={`action${a.danger ? ' danger' : ''}${a.selected ? ' selected' : ''}`}
            onClick={() => finish(a.id)}
          >
            {a.icon && (
              <span className="action-icon">
                <Icon name={a.icon} size={18} />
              </span>
            )}
            {a.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
