import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SoloDB } from './persistence';
import { createAppStore } from './store';
import { App } from './ui/App';
import { StoreContext } from './ui/StoreContext';
import './ui/styles.css';

const store = createAppStore({ db: new SoloDB() });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);
