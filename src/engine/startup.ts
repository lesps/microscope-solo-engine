import type { GameEvent, Id, PersonSlot } from './types';

/** Fills a generator template's `{partId}` placeholders, exchanging the swap pair when asked. */
export function fillTemplate(
  template: string,
  parts: { id: Id; text: string }[],
  swap?: [Id, Id],
): string {
  const texts = new Map(parts.map((p) => [p.id, p.text]));
  if (swap) {
    const [a, b] = swap;
    const ta = texts.get(a);
    texts.set(a, texts.get(b) ?? '');
    texts.set(b, ta ?? '');
  }
  return template.replace(/\{([^{}]*)\}/g, (_, id: string) => texts.get(id) ?? '');
}

/** "{name}, {role}, who wants {want}", dropping the clause of any missing part. */
export function personText(parts: { name?: string; role?: string; want?: string }): string {
  return [parts.name, parts.role, parts.want && `who wants ${parts.want}`]
    .filter(Boolean)
    .join(', ');
}

/** The name, role and want rolled by the person prompt whose result has sequence number `seq`. */
export function personPromptParts(
  events: readonly GameEvent[],
  seq: number,
): Partial<Record<PersonSlot, string>> {
  const batch = events.find((e) => e.seq === seq)?.batch;
  const parts: Partial<Record<PersonSlot, string>> = {};
  for (const e of events) {
    if (e.batch !== batch || e.type !== 'RollMade') continue;
    const slot = e.payload.purpose.match(/^prompt\.person\.(name|role|want)$/)?.[1] as PersonSlot;
    if (slot) parts[slot] = e.payload.text ?? '';
  }
  return parts;
}
