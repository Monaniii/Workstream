`import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5202,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8012",
        changeOrigin: true,
      },
    },
  },
})
