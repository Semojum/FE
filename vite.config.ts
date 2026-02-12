import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // WASM 모듈을 미리 빌드(pre-bundle)하지 않도록 제외합니다.
    exclude: ['@ohah/hwpjs', '@ohah/hwpjs-wasm32-wasi'],
  },
  build: {
    // WASM 파일 처리를 위한 설정
    assetsInlineLimit: 0,
  },
});
