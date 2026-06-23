// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api': {
        target: 'https://api.semojum.app',
        changeOrigin: true,
        secure: true,
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
      // 소셜 로그인(OAuth) 리다이렉트 경로
      '/oauth2': {
        target: 'https://api.semojum.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // 무거운 벤더 라이브러리를 별도 청크로 분리해 초기 번들 크기를 낮춘다.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // hwp.js / jszip은 동적 import로만 로드되므로 eager 청크에 합치지 않고
          // 그대로 두어 Rollup이 별도 비동기 청크로 유지하게 한다.
          if (
            id.includes('hwp.js') ||
            id.includes('jszip') ||
            id.includes('/cfb/') ||
            id.includes('/pako/')
          ) {
            return;
          }

          if (id.includes('pdfjs-dist') || id.includes('react-pdf')) {
            return 'pdf';
          }
          if (id.includes('katex')) return 'katex';
          if (id.includes('framer-motion')) return 'framer-motion';
          // 코어 react 런타임만 분리한다. react-dropzone·lucide-react 등
          // 'react'가 이름에 든 다른 패키지까지 묶으면 vendor와 순환 청크가 생긴다.
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/.test(
              id,
            )
          ) {
            return 'react-vendor';
          }
          return 'vendor';
        },
      },
    },
  },
});
