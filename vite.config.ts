import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base = nombre del repo, necesario para GitHub Pages (https://tobias104.github.io/clash-royale-tournament/)
export default defineConfig({ base: '/clash-royale-tournament/', plugins: [react()] });
