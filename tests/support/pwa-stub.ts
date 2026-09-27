import { useState } from 'react';

export const pwaStub = { needRefresh: false, offlineReady: false, updated: 0 };

export function useRegisterSW() {
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
