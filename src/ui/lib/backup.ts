import type { AppStore } from '../../store';
import { downloadText } from './download';

/** Every game in one dated bundle; on an iOS Home Screen app this opens the share sheet. */
export async function backupAll(store: AppStore) {
  const bundle = await store.getState().exportAll();
  await downloadText(
    `solo-microscope-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(bundle, null, 1),
    'application/json',
  );
}

const DAY = 86_400_000;

/** When any game was last exported: "never", "today", "yesterday" or "N days ago". */
export function lastBackupLabel(games: { lastExportedAt?: string }[], now: Date): string {
  const last = Math.max(
    0,
    ...games.map((g) => (g.lastExportedAt ? Date.parse(g.lastExportedAt) : 0)),
  );
  if (!last) return 'never';
  const days = Math.floor(now.getTime() / DAY) - Math.floor(last / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
