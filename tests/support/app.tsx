import { act } from '@testing-library/react';
import type { AppStore } from '../../src/store';
import { App } from '../../src/ui/App';
import { href, type Route } from '../../src/ui/router';
import { renderWith } from './ui';

export async function renderApp(store: AppStore, route: Route = { name: 'library' }) {
  window.location.hash = href(route);
  let r!: ReturnType<typeof renderWith>;
  await act(async () => {
    r = renderWith(store, <App pwa={false} />);
  });
  return r;
}

export async function go(route: Route) {
  await act(async () => {
    window.location.hash = href(route);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
