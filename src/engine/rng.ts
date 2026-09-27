import type { RngState } from './types';

// sfc32 (Chris Doty-Humphrey's Small Fast Counter). State is four uint32s.
function step(s: RngState): [number, RngState] {
  let [a, b, c, d] = s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return [t >>> 0, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
}

export function seedToState(seed: string): RngState {
  if (!/^[0-9a-f]{32}$/i.test(seed)) throw new Error('seed must be 32 hex chars (128 bits)');
  let s: RngState = [0, 1, 2, 3].map(
    (i) => parseInt(seed.slice(i * 8, i * 8 + 8), 16) >>> 0,
  ) as RngState;
  for (let i = 0; i < 12; i++) s = step(s)[1];
  return s;
}

export function nextUint32(s: RngState): [number, RngState] {
  return step(s);
}

/** Unbiased 1..sides via rejection sampling. */
export function rollDie(s: RngState, sides: number): [number, RngState] {
  if (!Number.isInteger(sides) || sides < 1) throw new Error(`invalid die d${sides}`);
  const limit = Math.floor(0x100000000 / sides) * sides;
  let state = s;
  for (;;) {
    const [x, next] = step(state);
    state = next;
    if (x < limit) return [(x % sides) + 1, state];
  }
}

export function seedFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
