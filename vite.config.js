import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 🟢 บรรทัดนี้สำคัญมาก! บังคับให้ Vite ดึงตัว Vue Build ที่มี Template Compiler ไปใช้ตอน Deploy
      'vue': 'vue/dist/vue.esm-bundler.js', 
    },
  },
  // 🟢 เพิ่มส่วนนี้เพื่ออนุญาตให้สแกน Vue Template ในไฟล์ JS ได้
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
  }
})