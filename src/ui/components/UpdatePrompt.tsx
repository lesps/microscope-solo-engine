import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * A Home Screen app can stay suspended for days without a navigation, which is when the browser
 * would normally look for a new service worker; so look again each time the app comes forward.
 */
function checkOnForeground(_url: string, r: ServiceWorkerRegistration | undefined) {
  if (!r) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void r.update().catch(() => {});
  });
}

/** New versions wait for the player to reload: never a silent activation mid-turn. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ onRegisteredSW: checkOnForeground });
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="toast" role="status">
      {needRefresh ? (
        <>
          <span>A new version is ready. Reload when you’re between turns.</span>
          <button onClick={() => updateServiceWorker(true)}>Reload</button>
          <button onClick={() => setNeedRefresh(false)}>Later</button>
        </>
      ) : (
        <>
          <span>Ready to work offline.</span>
          <button onClick={() => setOfflineReady(false)}>OK</button>
        </>
      )}
    </div>
  );
}
