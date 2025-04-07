import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig(({command}) => ({

  base: command === 'build' ? '/harmonic-series-online-synthesizer/' : '/',

  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'cert/localhost+2-key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, 'cert/localhost+2.pem')),
    },
    hmr: {
      protocol: 'wss',
      host: 'localhost',
      port: 5173, // Ensure this matches your Vite server port
    },
  },
  resolve: {
    alias: {
      'midi-file': path.resolve(__dirname, './node_modules/midi-file'),
      '@tonejs/midi': path.resolve(__dirname, './node_modules/@tonejs/midi')
    }
  },
  optimizeDeps: {
    include: ['midi-file', '@tonejs/midi']
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  }
}));