import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The generated client lives one directory up (../module_bindings) and imports
// the bare specifier "spacetimedb". dedupe makes Vite resolve that import from
// web/node_modules instead of walking up from module_bindings/, and fs.allow
// lets the dev server read files outside web/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['spacetimedb', 'react', 'react-dom'] },
  server: { port: 5173, fs: { allow: ['..'] } },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: { recharts: ['recharts'], spacetimedb: ['spacetimedb', 'spacetimedb/react'] },
      },
    },
  },
});
