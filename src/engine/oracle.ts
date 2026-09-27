import type { OracleCall } from './types';

export function effectiveOdds(odds: number, chaos: number | undefined): number {
  if (chaos === undefined) return odds;
  return Math.max(1, Math.min(9, odds + Math.floor((chaos - 5) / 2)));
}

export function qualifierFor(d6: number): 'but' | 'and' | undefined {
  return d6 === 1 ? 'but' : d6 === 6 ? 'and' : undefined;
}

export function resolveOracle(
  question: string,
  odds: number,
  chaos: number | undefined,
  roll: number,
  qualifierRoll: number | undefined,
  seq: number,
): OracleCall {
  const eff = effectiveOdds(odds, chaos);
  const call: OracleCall = { question, odds, effectiveOdds: eff, roll, answer: roll <= eff, seq };
  if (qualifierRoll !== undefined) {
    call.qualifierRoll = qualifierRoll;
    const q = qualifierFor(qualifierRoll);
    if (q) call.qualifier = q;
  }
  return call;
}

export function describeOracle(c: OracleCall): string {
  const base = c.answer ? 'Yes' : 'No';
  return c.qualifier ? `${base}, ${c.qualifier}…` : base;
}
