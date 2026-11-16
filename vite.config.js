import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const page = (path) => fileURLToPath(new URL(path, import.meta.url))

// The home page and games at /, the studio (drawing and writing, behind the
// PIN) at /studio/, and the public pages with what Ada has published:
// her comics at /comics/ and her blog at /blog/.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        studio: page('./studio/index.html'),
        comics: page('./comics/index.html'),
        blog: page('./blog/index.html'),
      },
    },
  },
})
