import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
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
});