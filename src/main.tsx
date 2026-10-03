import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SoloDB } from './persistence';
import { createAppStore } from './store';
import { App } from './ui/App';
import { StoreContext } from './ui/StoreContext';
import { localStore, markStandalone, restoreLastRoute } from './ui/lib/standalone';
import './ui/styles.css';

markStandalone(window, document.documentElement);
restoreLastRoute(window, localStore(window));

const store = createAppStore({ db: new SoloDB() });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);
