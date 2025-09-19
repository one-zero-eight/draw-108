import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import mkcert from "vite-plugin-mkcert";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // HTTPS support in development
    mkcert({
      hosts: ["local.innohassle.ru"],
    }),
    react()],
})
