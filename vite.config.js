import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  base: './',   // 🟢 เพิ่มบรรทัดนี้! ให้อ้างไฟล์แบบ relative ใช้ได้ทั้ง Vercel และ GitHub Pages
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'vue': 'vue/dist/vue.esm-bundler.js',
    },
  },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
  }
})
