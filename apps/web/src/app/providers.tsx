import React from 'react';
import { Provider } from 'react-redux';
import { store } from './store.js';
import type { AppStore } from './store.js';

export interface AppProvidersProps {
  children: React.ReactNode;
  storeInstance?: AppStore;
}

export function AppProviders({
  children,
  storeInstance = store,
}: AppProvidersProps): React.JSX.Element {
  return <Provider store={storeInstance}>{children}</Provider>;
}
