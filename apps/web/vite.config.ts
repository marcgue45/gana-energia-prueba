import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy a la API para evitar CORS en desarrollo
    proxy: { '/api': 'http://localhost:3000' },
  },
});
