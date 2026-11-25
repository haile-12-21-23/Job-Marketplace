import React from 'react';
import { createBrowserRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import PublicLayout from '../layouts/PublicLayout.js';
import AuthenticatedLayout from '../layouts/AuthenticatedLayout.js';
import HomePage from '../pages/HomePage.js';
import AppHomePage from '../pages/AppHomePage.js';
import NotFoundPage from '../pages/NotFoundPage.js';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
  {
    path: '/app',
    element: <AuthenticatedLayout />,
    children: [
      {
        index: true,
        element: <AppHomePage />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
