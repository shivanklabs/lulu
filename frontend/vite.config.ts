import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
  },
});
