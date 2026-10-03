import { useState } from 'react';

interface Options {
  onRegisteredSW?: (url: string, r: ServiceWorkerRegistration | undefined) => void;
}

export const pwaStub: {
  needRefresh: boolean;
  offlineReady: boolean;
  updated: number;
  options?: Options;
} = { needRefresh: false, offlineReady: false, updated: 0 };

export function useRegisterSW(options: Options = {}) {
  pwaStub.options = options;
  const need = useState(pwaStub.needRefresh);
  const ready = useState(pwaStub.offlineReady);
  return {
    needRefresh: need,
    offlineReady: ready,
    updateServiceWorker: async () => {
      pwaStub.updated += 1;
    },
  };
}
