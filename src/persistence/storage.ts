export type PersistStatus = 'persisted' | 'best-effort' | 'unsupported';

export interface StorageInfo {
  status: PersistStatus;
  usage?: number;
  quota?: number;
}

function storageApi(): StorageManager | undefined {
  return typeof navigator !== 'undefined' && navigator.storage ? navigator.storage : undefined;
}

export async function requestPersistence(): Promise<PersistStatus> {
  const s = storageApi();
  if (!s?.persist) return 'unsupported';
  try {
    return (await s.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}

export async function storageInfo(): Promise<StorageInfo> {
  const s = storageApi();
  if (!s?.persisted) return { status: 'unsupported' };
  const status: PersistStatus = (await s.persisted()) ? 'persisted' : 'best-effort';
  const est = s.estimate ? await s.estimate() : {};
  return { status, usage: est.usage, quota: est.quota };
}
