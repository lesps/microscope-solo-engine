import {
  apply,
  chronological,
  describeChange,
  describePlacement,
  describeOracle,
  eventsOf,
  initialGame,
  periods,
  scenesOf,
  subjectAt,
  wordCount,
  type Entry,
  type Game,
  type GameEvent,
  type Placement,
  type Startup,
  type Tone,
} from '../engine';

export const toneMark = (t: Tone) => (t === 'light' ? '○' : '●');
const KIND = { period: 'Period', event: 'Event', scene: 'Scene' } as const;

function stripMarkers(prose: string): string {
  return prose.replace(/\[\[REVERSAL: ([^\]]*)\]\]/g, '*⟨$1⟩* ');
}

function paragraphs(prose: string): string {
  const t = stripMarkers(prose).trim();
  return t ? `${t}\n\n` : '';
}

export function statsFooter(g: Game): string {
  const entries = Object.values(g.entries);
  const by = (k: Entry['kind']) => {
    const es = entries.filter((e) => e.kind === k);
    const light = es.filter((e) => e.tone === 'light').length;
    return `${es.length} ${KIND[k].toLowerCase()}${es.length === 1 ? '' : 's'} (${light} ○, ${es.length - light} ●)`;
  };
  const words = entries.reduce((n, e) => n + wordCount(e.prose), 0);
  return [
    '---',
    '',
    `*Rounds: ${g.rounds.filter((r) => r.ended).length} · ${by('period')}, ${by('event')}, ${by('scene')} · ` +
      `Words: ${words} · Overrides: ${g.stats.overrides} · Retcons: ${g.stats.retcons}*`,
    '',
  ].join('\n');
}

/** The seed or generator a game started from, printed after the premise. */
export function startupBlock(startup: Startup | undefined): string {
  if (!startup) return '';
  const from = `**Started from:** ${startup.kind === 'seed' ? startup.title : startup.name} *(${startup.packName})*`;
  if (startup.kind === 'generator') return `${from} — “${startup.reading}”\n\n`;
  const notes = startup.notes.map((n) => `- ${n.question} — ${n.answers.join(' · ')}`).join('\n');
  return notes ? `${from}\n\n${notes}\n\n` : `${from}\n\n`;
}

function premise(g: Game): string {
  if (g.ruleset === 'chronicle' && g.subject) {
    return `**Subject:** ${g.subject.name} — ${g.subject.description}\n\n**Traits at the start:** ${g.subject.traits.join(', ')}\n\n`;
  }
  return `> ${g.bigPicture}\n\n`;
}

function palette(g: Game): string {
  const list = (xs: { text: string }[]) => (xs.length ? xs.map((x) => x.text).join(', ') : '—');
  return `## Palette\n\n**Yes:** ${list(g.palette.yes)}\n\n**No:** ${list(g.palette.no)}\n\n`;
}

function sceneBody(
  g: Game,
  s: Extract<Entry, { kind: 'scene' }>,
  prose: string,
  answer: string | undefined,
): string {
  let out = `**Question:** ${s.question}\n\n`;
  if (s.setting) out += `*Setting: ${s.setting}*\n\n`;
  out += paragraphs(prose);
  if (answer) out += `**Answer:** ${answer}\n\n`;
  const cast = s.characterIds.map((id) => g.characters[id]?.name).filter(Boolean);
  if (cast.length) out += `*Characters: ${cast.join(', ')}*\n\n`;
  return out;
}

/** Big Picture, Palette, then Periods in timeline order with Events and Scenes nested. Latest prose. */
export function chronologicalManuscript(g: Game): string {
  let out = `# ${g.title}\n\n${premise(g)}${startupBlock(g.startup)}${palette(g)}`;
  for (const p of periods(g)) {
    out += `## ${toneMark(p.tone)} ${p.title}\n\n`;
    if (g.ruleset === 'chronicle') {
      const bits: string[] = [];
      if (p.anchorId) bits.push(`Anchor: ${g.characters[p.anchorId]?.name ?? '?'}`);
      if (p.change) bits.push(`Change: ${describeChange(p.change)}`);
      const s = subjectAt(g, p.id);
      if (s) bits.push(`Traits: ${s.traits.join(', ')}`);
      out += `*${bits.join(' · ')}*\n\n`;
    }
    out += paragraphs(p.prose);
    for (const e of eventsOf(g, p.id)) {
      out += `### ${toneMark(e.tone)} ${e.title}\n\n${paragraphs(e.prose)}`;
      for (const s of scenesOf(g, e.id)) {
        out += `#### ${toneMark(s.tone)} ${s.title}\n\n${sceneBody(g, s, s.prose, s.answer)}`;
      }
    }
  }
  return out + statsFooter(g);
}

/** Lens's native form: three levels of titles with tone markers, no prose. */
export function outline(g: Game): string {
  let out = `# ${g.title}\n\n`;
  for (const e of chronological(g)) {
    const indent = e.kind === 'period' ? '' : e.kind === 'event' ? '  ' : '    ';
    out += `${indent}- ${toneMark(e.tone)} ${e.title}\n`;
  }
  return `${out}\n${statsFooter(g)}`;
}

export interface PlayOrderOptions {
  rolls?: boolean;
}

function describeOverride(g: Game, mechanic: string, v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (mechanic === 'placement') {
    const p = v as Placement;
    const kind = g.turn?.rolled.placement?.kind ?? 'event';
    return describePlacement(g, kind, p);
  }
  if (mechanic === 'legacy.evict' || mechanic === 'legacy.explore')
    return g.legacies.find((l) => l.id === v)?.text ?? String(v);
  if (mechanic === 'cohesion') return v ? 'another turn' : 'on to Legacies';
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: string }).text);
  return String(v);
}

function rollLine(ev: GameEvent, g: Game): string | undefined {
  if (ev.type === 'RollMade') {
    const p = ev.payload;
    return `- 🎲 ${p.purpose}: d${p.sides} → ${p.result}${p.text ? ` · ${p.text}` : ''}`;
  }
  if (ev.type === 'CardDrawn') {
    const p = ev.payload;
    return `- 🂠 ${p.purpose}${p.role ? ` (${p.role})` : ''}: ${p.cardId}${p.reversed ? ' reversed' : ''} · ${p.keyword}`;
  }
  if (ev.type === 'DeckReshuffled') return '- 🂠 deck reshuffled';
  if (ev.type === 'OverrideUsed') {
    const { mechanic, rolled, chosen } = ev.payload;
    return `- ✎ override ${mechanic}: ${describeOverride(g, mechanic, rolled)} → ${describeOverride(g, mechanic, chosen)}`;
  }
  return undefined;
}

/** Rounds in the order they were played, entries as written at play time (not their revisions). */
export function playOrderManuscript(
  events: readonly GameEvent[],
  opts: PlayOrderOptions = {},
): string {
  const showRolls = opts.rolls ?? true;
  let g = initialGame();
  let out = '';
  let setupDone = false;
  let pendingRolls: string[] = [];
  const flushRolls = () => {
    if (showRolls && pendingRolls.length) block(pendingRolls.join('\n') + '\n\n');
    pendingRolls = [];
  };
  // Starts a paragraph-level block, closing any open list with a blank line.
  const block = (s: string) => {
    if (out && !out.endsWith('\n\n')) out += '\n';
    out += s;
  };
  for (const ev of events) {
    const before = g;
    g = apply(g, ev);
    const rl = rollLine(ev, before);
    if (rl) {
      pendingRolls.push(rl);
      continue;
    }
    switch (ev.type) {
      case 'GameCreated':
        out += `# ${g.title} — in the order it was played\n\n## Setup\n\n`;
        break;
      case 'BigPictureSet':
        out += `**Big Picture:** ${ev.payload.text}\n\n`;
        break;
      case 'SeedApplied':
      case 'GeneratorReadingAccepted':
        block(startupBlock(ev.payload.startup));
        break;
      case 'SubjectSet':
        out += `**Subject:** ${ev.payload.subject.name} — ${ev.payload.subject.description} (${ev.payload.subject.traits.join(', ')})\n\n`;
        break;
      case 'BookendsSet':
        out += `**Bookends:** ${toneMark(ev.payload.start.tone)} ${ev.payload.start.title} … ${toneMark(ev.payload.end.tone)} ${ev.payload.end.title}\n\n`;
        break;
      case 'PaletteItemAdded':
        out += `- Palette ${ev.payload.list === 'yes' ? 'Yes' : 'No'}: ${ev.payload.item.text}${ev.payload.item.rolled ? ' (rolled)' : ''}\n`;
        break;
      case 'EntryCreated':
        if (ev.payload.entry.firstPass) {
          const e = ev.payload.entry;
          const seat = g.seats.find((s) => s.id === e.seatId)?.name ?? '';
          block(
            `**First Pass (${seat}):** ${toneMark(e.tone)} ${KIND[e.kind]} — ${e.title}\n\n${paragraphs(e.prose)}`,
          );
        }
        break;
      case 'DialsSet':
        if (!setupDone)
          block(
            `**Dials:** Mood ${ev.payload.mood}, Cohesion ${ev.payload.cohesion}${ev.payload.chaos !== undefined ? `, Chaos ${ev.payload.chaos}` : ''}\n\n`,
          );
        break;
      case 'RoundStarted': {
        setupDone = true;
        flushRolls();
        const lens = g.seats.find((s) => s.id === ev.payload.lensSeatId)?.name ?? '';
        block(`## Round ${ev.payload.n}\n\n*Lens: ${lens}*\n\n`);
        break;
      }
      case 'FocusSet':
        flushRolls();
        out += `**Focus:** ${ev.payload.text}${ev.payload.source !== 'player' ? ` *(rolled: ${ev.payload.source})*` : ''}\n\n`;
        break;
      case 'TurnStarted': {
        flushRolls();
        const seat = g.seats.find((s) => s.id === ev.payload.seatId)?.name ?? '';
        const r = g.rounds[g.rounds.length - 1]!;
        out += `### ${ev.payload.kind === 'legacy' ? 'Legacy turn' : `Turn ${r.turns.filter((t) => t.kind === 'normal').length}`} — ${seat}\n\n`;
        break;
      }
      case 'OracleAsked':
        pendingRolls.push(
          `- ☯ Oracle: “${ev.payload.call.question}” (${ev.payload.call.effectiveOdds}/10) → ${describeOracle(ev.payload.call)}`,
        );
        break;
      case 'TurnCommitted': {
        flushRolls();
        const e = g.entries[ev.payload.entryId]!;
        out += `${toneMark(e.tone)} **${KIND[e.kind]}: ${e.title}**`;
        if (e.legacyId)
          out += ` *(explores “${g.legacies.find((l) => l.id === e.legacyId)?.text ?? ''}”)*`;
        out += '\n\n';
        out +=
          e.kind === 'scene'
            ? sceneBody(g, e, e.playProse ?? e.prose, e.answer)
            : paragraphs(e.playProse ?? e.prose);
        break;
      }
      case 'LegacyAdded':
        flushRolls();
        out += `**Legacy added:** ${ev.payload.legacy.text}\n\n`;
        break;
      case 'LegacyRemoved':
        out += `**Legacy removed:** ${before.legacies.find((l) => l.id === ev.payload.id)?.text ?? ''}\n\n`;
        break;
      case 'LegacyExplored':
        flushRolls();
        out += `**Legacy explored:** ${g.legacies.find((l) => l.id === ev.payload.id)?.text ?? ''}\n\n`;
        break;
      case 'DialsAdjusted': {
        flushRolls();
        const { before: b, after: a } = ev.payload;
        out += `**Dials (${ev.payload.drift}):** Mood ${b.mood}→${a.mood}, Cohesion ${b.cohesion}→${a.cohesion}${a.chaos !== undefined ? `, Chaos ${b.chaos}→${a.chaos}` : ''}\n\n`;
        break;
      }
      case 'Retconned':
        out += `*Retcon: ${ev.payload.field} “${String(ev.payload.before)}” → “${String(ev.payload.after)}” — ${ev.payload.reason}*\n\n`;
        break;
      default:
        break;
    }
  }
  flushRolls();
  return out + statsFooter(g);
}
