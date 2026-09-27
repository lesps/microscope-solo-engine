import { useRegisterSW } from 'virtual:pwa-register/react';

/** New versions wait for the player to reload: never a silent activation mid-turn. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
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
