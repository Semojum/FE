// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://34.64.201.254:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
        proxyTimeout: 0,
        timeout: 0,
        headers: {
          Connection: 'keep-alive',
          'Accept-Encoding': 'identity', // 압축 방지
        },
        configure: (proxy) => {
          const proxyInstance = proxy as any;

          // ✅ 1. 버퍼링 방지 헤더 주입 (onProxyRes 대신 여기서 처리)
          proxyInstance.on('proxyRes', (proxyRes: any, req: any, _res: any) => {
            // SSE를 위해 프록시 버퍼링 강제 해제
            proxyRes.headers['x-accel-buffering'] = 'no';
            proxyRes.headers['cache-control'] = 'no-cache, no-transform';

            // 로그 출력 (기존 로직 유지)
            const statusColor =
              proxyRes.statusCode === 200 ? '\x1b[32m' : '\x1b[31m';
            console.log(
              `${statusColor}[Proxy Response]\x1b[0m ${proxyRes.statusCode} ${req.url}`,
            );
          });

          // 2. 기타 이벤트 로그
          proxyInstance.on('error', (err: any) => {
            console.log('\x1b[31m[Proxy Error]\x1b[0m', err);
          });

          proxyInstance.on('proxyReq', (_proxyReq: any, req: any) => {
            console.log(
              `\x1b[34m[Proxy Request]\x1b[0m ${req.method} ${req.url}`,
            );
          });
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@ohah/hwpjs', '@ohah/hwpjs-wasm32-wasi'],
  },
  build: {
    assetsInlineLimit: 0,
  },
});
