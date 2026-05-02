import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

// vite-plugin-cesium handles Cesium's static assets (Workers, Widgets,
// Assets, ThirdParty) so we don't have to copy them by hand.
export default defineConfig({
  plugins: [react(), cesium()],
  server: { port: 5174, host: true },
})
