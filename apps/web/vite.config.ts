import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Referrer-Policy': 'no-referrer',
    },
  },
  preview: {
    headers: {
      'Referrer-Policy': 'no-referrer',
    },
  },
});
