import { useEffect } from 'react';

export type HotkeyMap = Partial<Record<'n' | 'r' | 'o' | 'e' | 'escape' | 'undo', () => void>>;

function typing(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

/** Single-letter keys fire only when focus is not in a text field; Cmd/Ctrl+Z likewise defers to native undo there. */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        map.escape?.();
        return;
      }
      if (typing(document.activeElement)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (map.undo) {
          e.preventDefault();
          map.undo();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase() as 'n' | 'r' | 'o' | 'e';
      const f = map[k];
      if (f) {
        e.preventDefault();
        f();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [map, enabled]);
}

/** Click the first visible, enabled element matching the selector. */
export function clickFirst(selector: string) {
  const el = Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find(
    (b) => !b.disabled && b.offsetParent !== null,
  );
  el?.click();
  return !!el;
}
