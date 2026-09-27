import type { Tone } from './types';
import { clampDial } from './settings';

export function randomDelta(d6: number): -1 | 0 | 1 {
  return d6 <= 2 ? -1 : d6 <= 4 ? 0 : 1;
}

/** Mood moves one step toward the tone that appeared less this round (Light is favored by high Mood). */
export function counterTrendMoodDelta(tones: Tone[]): -1 | 0 | 1 {
  const light = tones.filter((t) => t === 'light').length;
  const dark = tones.length - light;
  return light < dark ? 1 : dark < light ? -1 : 0;
}

export function chaosDelta(tones: Tone[]): -1 | 0 | 1 {
  const light = tones.filter((t) => t === 'light').length;
  const dark = tones.length - light;
  return dark > light ? 1 : light > dark ? -1 : 0;
}

export function toneFromRoll(d10: number, mood: number): Tone {
  return d10 <= mood ? 'light' : 'dark';
}

export { clampDial };
