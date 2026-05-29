import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project is served from https://beko2210.github.io/Prompt_Academy/ on GitHub Pages,
// so the production base must match the repo name. Dev stays at '/'.
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Prompt_Academy/' : '/',
  plugins: [react()],
}))
