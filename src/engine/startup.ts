import type { Id } from './types';

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
