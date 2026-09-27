import { describe, expect, it } from 'vitest';
import { rollDie, seedToState } from './rng';

const SEED = '0123456789abcdef0123456789abcdef';

describe('rng', () => {
  it('produces a fixed sequence for a fixed seed (regression lock)', () => {
    let s = seedToState(SEED);
    const out: number[] = [];
    for (let i = 0; i < 10; i++) {
      const [r, n] = rollDie(s, 100);
      out.push(r);
      s = n;
    }
    expect(out).toMatchInlineSnapshot(`
      [
        96,
        81,
        57,
        16,
        69,
        14,
        31,
        47,
        50,
        97,
      ]
    `);
  });

  it('d10 distribution is within ±15% of expected over 10,000 rolls', () => {
    let s = seedToState(SEED);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const [r, n] = rollDie(s, 10);
      counts[r - 1]++;
      s = n;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(850);
      expect(c).toBeLessThanOrEqual(1150);
    }
  });

  it('supports any dN including d1 and d100', () => {
    let s = seedToState(SEED);
    for (const sides of [1, 2, 3, 6, 7, 20, 100, 2520]) {
      const [r, n] = rollDie(s, sides);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(sides);
      s = n;
    }
  });

  it('rejects malformed seeds and dice', () => {
    expect(() => seedToState('xyz')).toThrow();
    expect(() => rollDie(seedToState(SEED), 0)).toThrow();
  });
});
