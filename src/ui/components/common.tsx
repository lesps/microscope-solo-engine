import { useEffect, useRef, type ReactNode } from 'react';
import type { Tone } from '../../engine';

export function ToneMark({ tone }: { tone: Tone }) {
  return (
    <span
      className={`tone ${tone}`}
      role="img"
      aria-label={tone === 'light' ? 'Light' : 'Dark'}
      title={tone === 'light' ? 'Light' : 'Dark'}
    />
  );
}

export function Lock() {
  return (
    <span className="lock" role="img" aria-label="Locked" title="Facts locked">
      🔒
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="row spread">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CharCount({ value, max }: { value: string; max: number }) {
  return (
    <span className={value.length > max ? 'warn' : 'hint'}>
      {value.length}/{max}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label>
        {label}
        {children}
      </label>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
