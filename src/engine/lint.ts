import { periodOf } from './timeline';
import type { Game, Id } from './types';

export interface Warning {
  code: 'concrete-date' | 'character-spans-periods' | 'immortal-character' | 'scene-budget';
  targetId: Id;
  message: string;
}

const DATE_RE =
  /\b\d[\d,]*\s*(?:st|nd|rd|th)?\s*(?:years?|yrs?|centur(?:y|ies)|decades?|millenni(?:um|a)|AD|BC|BCE|CE)\b/i;

export function hasConcreteDate(text: string): boolean {
  return DATE_RE.test(text);
}

export function wordCount(text: string): number {
  const t = text.replace(/\[\[REVERSAL:[^\]]*\]\]/g, ' ').trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Lens's principles as soft checks: they never block a command. */
export function softWarnings(g: Game): Warning[] {
  const out: Warning[] = [];
  for (const e of Object.values(g.entries)) {
    if (hasConcreteDate(e.title) || hasConcreteDate(e.prose)) {
      out.push({
        code: 'concrete-date',
        targetId: e.id,
        message: `"${e.title}" names a concrete date or duration; Lens keeps time vague.`,
      });
    }
    if (e.kind === 'scene') {
      const n = wordCount(e.prose);
      if (n && (n < e.budget.min || n > e.budget.max)) {
        out.push({
          code: 'scene-budget',
          targetId: e.id,
          message: `"${e.title}" is ${n} words; budget is ${e.budget.min}–${e.budget.max}.`,
        });
      }
    }
  }
  for (const c of Object.values(g.characters)) {
    if (c.immortal) {
      out.push({
        code: 'immortal-character',
        targetId: c.id,
        message: `${c.name} is marked immortal.`,
      });
    }
    const ps = new Set(c.entryIds.map((id) => periodOf(g, id)?.id).filter(Boolean));
    if (ps.size > 1 && !c.immortal) {
      out.push({
        code: 'character-spans-periods',
        targetId: c.id,
        message: `${c.name} appears in ${ps.size} Periods; mortals usually stay in one.`,
      });
    }
  }
  return out;
}
