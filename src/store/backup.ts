import type { GameMeta } from '../persistence';

export interface BackupThresholds {
  rounds: number;
  days: number;
}
export const DEFAULT_BACKUP: BackupThresholds = { rounds: 3, days: 7 };

const DAY = 86_400_000;

/**
 * A backup is due when `rounds` rounds have ended since the last export, or `days` have passed since
 * the last export (or creation) with at least one round played — whichever comes first. Dismissing
 * snoozes the reminder until the next round ends.
 */
export function backupDue(
  meta: GameMeta,
  now: Date,
  t: BackupThresholds = DEFAULT_BACKUP,
): boolean {
  if (meta.backupSnoozedAtRound !== undefined && meta.roundsEnded <= meta.backupSnoozedAtRound)
    return false;
  const since = meta.roundsEnded - (meta.roundsAtLastExport ?? 0);
  if (since <= 0) return false;
  if (since >= t.rounds) return true;
  const from = Date.parse(meta.lastExportedAt ?? meta.createdAt);
  return now.getTime() - from >= t.days * DAY;
}
