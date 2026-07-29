import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  

  plugins: [vue()],
  base: '/Phakin-Calendar/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // บังคับใช้ Vue build ที่มี Template Compiler
      'vue': 'vue/dist/vue.esm-bundler.js',
    },
  },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
})
