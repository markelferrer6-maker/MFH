import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseNum } from '../lib/format';

const show = (n: number | undefined): string => (n === undefined ? '' : String(n).replace('.', ','));

/**
 * Campo numérico pensado para el móvil: teclado numérico, acepta coma decimal
 * y selecciona todo al tocar para sobrescribir rápido.
 */
export function NumberInput({
  value,
  placeholder,
  onChange,
  decimal = false,
  label,
  className = 'set-input',
}: {
  value: number | undefined;
  placeholder?: number;
  onChange: (n: number | undefined) => void;
  decimal?: boolean;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(show(value));
  }, [value]);
  return (
    <input
      className={className}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      enterKeyHint="done"
      aria-label={label}
      value={text}
      placeholder={show(placeholder)}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(show(value));
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onChange={(e) => {
        const t = e.target.value;
        if (!(decimal ? /^\d*[.,]?\d{0,2}$/ : /^\d*$/).test(t)) return;
        setText(t);
        onChange(parseNum(t));
      }}
    />
  );
}

/** Área de texto que crece con su contenido. */
export function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  label,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
