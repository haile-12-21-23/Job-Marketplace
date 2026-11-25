import React from 'react';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './app/providers.js';
import { router } from './app/router.js';

export default function App(): React.JSX.Element {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
