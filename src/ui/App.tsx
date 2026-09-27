import { lazy, Suspense, useEffect } from 'react';
import { useApp, useAppStore } from './StoreContext';
import { PersistIndicator } from './components/Status';
import { UpdatePrompt } from './components/UpdatePrompt';
import { href, useRoute } from './router';
import LibraryScreen from './screens/LibraryScreen';

const NewGameScreen = lazy(() => import('./screens/NewGameScreen'));
const SetupScreen = lazy(() => import('./screens/SetupScreen'));
const TableScreen = lazy(() => import('./screens/TableScreen'));
const SceneScreen = lazy(() => import('./screens/SceneScreen'));
const GameSettingsScreen = lazy(() => import('./screens/GameSettingsScreen'));
const PacksScreen = lazy(() => import('./screens/PacksScreen'));
const AppSettingsScreen = lazy(() => import('./screens/AppSettingsScreen'));

export function App({ pwa = true }: { pwa?: boolean }) {
  const store = useAppStore();
  const ready = useApp((s) => s.ready);
  const route = useRoute();
  useEffect(() => {
    void store.getState().init();
  }, [store]);
  useEffect(() => {
    if (route.name === 'library') store.getState().closeGame();
  }, [route.name, store]);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={href({ name: 'library' })}>
          Solo Microscope
        </a>
        <nav aria-label="Main">
          <a href={href({ name: 'library' })}>Library</a>
          <a href={href({ name: 'packs' })}>Packs</a>
          <a href={href({ name: 'app-settings' })}>Storage</a>
          <PersistIndicator />
        </nav>
      </header>
      {!ready ? (
        <div className="page">Loading…</div>
      ) : (
        <Suspense fallback={<div className="page">Loading…</div>}>
          {route.name === 'library' && <LibraryScreen />}
          {route.name === 'new' && <NewGameScreen />}
          {route.name === 'setup' && <SetupScreen gameId={route.gameId} />}
          {route.name === 'table' && <TableScreen gameId={route.gameId} />}
          {route.name === 'scene' && <SceneScreen gameId={route.gameId} entryId={route.entryId} />}
          {route.name === 'game-settings' && <GameSettingsScreen gameId={route.gameId} />}
          {route.name === 'packs' && <PacksScreen />}
          {route.name === 'app-settings' && <AppSettingsScreen />}
          {route.name === 'not-found' && (
            <div className="page">
              Nothing at “{route.path}”. <a href="#/">Back to the Library</a>
            </div>
          )}
        </Suspense>
      )}
      {pwa && <UpdatePrompt />}
    </div>
  );
}
