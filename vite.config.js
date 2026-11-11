import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const page = (path) => fileURLToPath(new URL(path, import.meta.url))

// Two pages: the game arcade at / and the Graphic Novel Creator at /studio/.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        studio: page('./studio/index.html'),
      },
    },
  },
})
