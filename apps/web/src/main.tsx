import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppErrorBoundary } from './app/AppErrorBoundary.js';
import App from './App.js';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element with id="root" not found. Check index.html.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
