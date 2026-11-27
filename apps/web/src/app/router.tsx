import React from 'react';
import { createBrowserRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import PublicLayout from '../layouts/PublicLayout.js';
import AuthenticatedLayout from '../layouts/AuthenticatedLayout.js';
import HomePage from '../pages/HomePage.js';
import RegisterPage from '../pages/RegisterPage.js';
import VerifyEmailPage from '../pages/VerifyEmailPage.js';
import LoginPage from '../pages/LoginPage.js';
import ForgotPasswordPage from '../pages/ForgotPasswordPage.js';
import ResetPasswordPage from '../pages/ResetPasswordPage.js';
import AppHomePage from '../pages/AppHomePage.js';
import NotFoundPage from '../pages/NotFoundPage.js';
import RequireAuthGuard from '../components/auth/RequireAuthGuard.js';

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
        path: 'register',
        element: <RegisterPage />,
      },
      {
        path: 'verify-email',
        element: <VerifyEmailPage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'forgot-password',
        element: <ForgotPasswordPage />,
      },
      {
        path: 'reset-password',
        element: <ResetPasswordPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
  {
    path: '/app',
    element: (
      <RequireAuthGuard>
        <AuthenticatedLayout />
      </RequireAuthGuard>
    ),
    children: [
      {
        index: true,
        element: <AppHomePage />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
