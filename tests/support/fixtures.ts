import type { Mode, ModedMechanic, Period, Settings } from '../../src/engine';
import { setupGame } from './autoplay';
import { Driver } from './driver';

export function withModes(
  modes: Partial<Record<ModedMechanic, Mode>>,
  rest: Partial<Settings> = {},
) {
  return (s: Settings): Settings => ({ ...s, ...rest, modes: { ...s.modes, ...modes } });
}

/** A Lens game with one player seat only, a Focus set, ready for StartTurn. */
export function readyForTurn(settings?: (s: Settings) => Settings, phantoms?: number): Driver {
  const d = new Driver();
  setupGame(d, { settings, phantoms });
  d.run({ type: 'StartRound' });
  if (!d.state.rounds[0]!.focus) d.run({ type: 'SetFocus', text: 'Trade' });
  return d;
}

export function startPeriod(d: Driver): Period {
  return Object.values(d.state.entries).find(
    (e): e is Period => e.kind === 'period' && e.bookend === 'start',
  )!;
}
