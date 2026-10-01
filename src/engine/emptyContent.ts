import type { Content } from './types';

export function emptyContent(): Content {
  return { tables: {}, decks: {}, groups: {}, seeds: {}, generators: {} };
}
