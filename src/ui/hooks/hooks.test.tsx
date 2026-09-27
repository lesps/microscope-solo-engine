import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { gameInPlay, makeStore } from '../../../tests/support/ui';
import { StoreContext, useAppStore } from '../StoreContext';
import { navigate, useRoute } from '../router';
import { clickFirst, useHotkeys } from './useHotkeys';
import { useOpenGame } from './useOpenGame';
import { useReducedMotion } from './useReducedMotion';
import { downloadText, readJsonFile, slug } from '../lib/download';

describe('useHotkeys', () => {
  function setup(enabled = true) {
    const map = { n: vi.fn(), r: vi.fn(), o: vi.fn(), e: vi.fn(), escape: vi.fn(), undo: vi.fn() };
    const hook = renderHook(({ on }) => useHotkeys(map, on), { initialProps: { on: enabled } });
    return { map, hook };
  }

  it('maps N, R, O, E, Esc and Ctrl/Cmd+Z', () => {
    const { map } = setup();
    for (const key of ['n', 'r', 'o', 'e']) fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'N' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(map.n).toHaveBeenCalledTimes(2);
    expect(map.r).toHaveBeenCalledTimes(1);
    expect(map.o).toHaveBeenCalledTimes(1);
    expect(map.e).toHaveBeenCalledTimes(1);
    expect(map.escape).toHaveBeenCalledTimes(1);
    expect(map.undo).toHaveBeenCalledTimes(2);
  });

  it('ignores letters and undo while typing, other modifiers, redo and unmapped keys', () => {
    const { map } = setup();
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    input.blur();
    input.remove();
    fireEvent.keyDown(window, { key: 'n', altKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'q' });
    expect(map.n).not.toHaveBeenCalled();
    expect(map.undo).not.toHaveBeenCalled();
  });

  it('Escape still works while typing', () => {
    const { map } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    input.remove();
    expect(map.escape).toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const { map } = setup(false);
    fireEvent.keyDown(window, { key: 'n' });
    expect(map.n).not.toHaveBeenCalled();
  });

  it('clickFirst clicks the first visible, enabled match', () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <>
        <button data-k disabled onClick={a}>
          a
        </button>
        <button data-k onClick={b}>
          b
        </button>
      </>,
    );
    // jsdom has no layout: offsetParent is null everywhere, so fake visibility.
    for (const el of screen.getAllByRole('button'))
      Object.defineProperty(el, 'offsetParent', { value: document.body });
    expect(clickFirst('[data-k]')).toBe(true);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    expect(clickFirst('[data-none]')).toBe(false);
  });
});

describe('useReducedMotion', () => {
  it('follows the media query and its changes', () => {
    let listener: (() => void) | undefined;
    const mq = {
      matches: false,
      addEventListener: (_: string, l: () => void) => (listener = l),
      removeEventListener: vi.fn(),
    };
    const spy = vi.spyOn(window, 'matchMedia').mockReturnValue(mq as unknown as MediaQueryList);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    mq.matches = true;
    act(() => listener!());
    expect(result.current).toBe(true);
    spy.mockRestore();
  });
});

describe('useRoute and navigate', () => {
  it('tracks hash changes', async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: 'library' });
    act(() => navigate({ name: 'table', gameId: 'G1' }));
    await waitFor(() => expect(result.current).toEqual({ name: 'table', gameId: 'G1' }));
    act(() => navigate({ name: 'not-found', path: 'x' }));
    await waitFor(() => expect(result.current).toEqual({ name: 'library' }));
  });
});

describe('useOpenGame', () => {
  it('reports loading, then ready for an existing game and missing otherwise', async () => {
    const store = await makeStore();
    const id = await gameInPlay(store, { start: false });
    store.getState().closeGame();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
    );
    const { result, rerender } = renderHook(({ gid }) => useOpenGame(gid), {
      wrapper,
      initialProps: { gid: id },
    });
    expect(result.current).toBe('loading');
    await waitFor(() => expect(result.current).toBe('ready'));
    rerender({ gid: 'nope' });
    await waitFor(() => expect(result.current).toBe('missing'));
  });

  it('useAppStore throws without a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAppStore())).toThrow('StoreContext missing');
  });
});

describe('download helpers', () => {
  it('slug makes safe file names', () => {
    expect(slug('The River: Rises & Drowns!')).toBe('the-river-rises-drowns');
    expect(slug('!!!')).toBe('game');
    expect(slug('x'.repeat(60))).toHaveLength(40);
  });

  it('downloadText clicks a temporary link with the file name', () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadText('a.md', '# hi', 'text/markdown');
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.useRealTimers();
    click.mockRestore();
  });

  it('readJsonFile parses a File', async () => {
    const f = new File([JSON.stringify({ a: 1 })], 'x.json');
    expect(await readJsonFile(f)).toEqual({ a: 1 });
  });
});
