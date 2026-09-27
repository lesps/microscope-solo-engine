import {
  execute,
  initialGame,
  type Command,
  type Content,
  type Env,
  type Game,
  type GameEvent,
  type Result,
} from '../../src/engine';
import { testContent } from './content';

export const SEED = '00112233445566778899aabbccddeeff';

export function makeEnv(content: Content = testContent()): Env {
  let n = 0;
  let t = Date.UTC(2026, 0, 1);
  return {
    newId: () => `id${String(++n).padStart(6, '0')}`,
    now: () => new Date((t += 1000)).toISOString(),
    content,
  };
}

export class Driver {
  state: Game = initialGame();
  events: GameEvent[] = [];
  constructor(public env: Env = makeEnv()) {}

  run(cmd: Command): GameEvent[] {
    const r = execute(this.state, cmd, this.env);
    if (!r.ok) throw new Error(`${cmd.type} rejected: ${r.rejection.code}: ${r.rejection.message}`);
    this.state = r.state;
    this.events.push(...r.events);
    return r.events;
  }

  try(cmd: Command): Result {
    const r = execute(this.state, cmd, this.env);
    if (r.ok) {
      this.state = r.state;
      this.events.push(...r.events);
    }
    return r;
  }

  rejection(cmd: Command) {
    const r = execute(this.state, cmd, this.env);
    if (r.ok) throw new Error(`${cmd.type} was accepted`);
    return r.rejection;
  }

  types(events: GameEvent[]) {
    return events.map((e) => e.type);
  }
}
export { testContent } from './content';
