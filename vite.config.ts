// vite.config.ts
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 앱 버전은 Tauri 설정을 단일 출처로 삼는다. GET /api/app/version?current= 에 그대로 보내고,
// 서버가 minSupportedVersion과 비교해 강제 업데이트 여부를 계산한다.
const appVersion =
  (
    JSON.parse(
      readFileSync(
        new URL('./src-tauri/tauri.conf.json', import.meta.url),
        'utf-8',
      ),
    ) as { version?: string }
  ).version ?? '0.0.0';

// 점자 조판 규칙은 Semojum/braille-assist가 단일 출처다(python·ts·java 동일 출력).
// npm 미배포 + ts/가 하위 디렉터리라 bun add로 못 받으므로 submodule 소스를 직접 가리킨다.
// 버전은 vendor/braille-assist 서브모듈 커밋으로 고정된다. vitest.config.ts도 이걸 쓴다.
export const alias = {
  '@semojum/braille-assist': new URL(
    './vendor/braille-assist/ts/src/index.ts',
    import.meta.url,
  ).pathname,
};

// pdf.js 보조 자료(CMap · 표준 글꼴)를 /pdfjs/ 아래로 함께 담는다.
//
// 한글 PDF는 CID 폰트를 쓰는 경우가 많은데, pdf.js는 그 글자를 그릴 때 CMap 파일을
// 따로 읽어야 한다. 없으면 "Ensure that the cMapUrl ... are provided" 경고와 함께
// 그 페이지의 글자가 **하나도 그려지지 않고** 표·선만 남는다. 렌더도 느려진다
// (실측: 같은 쪽이 6,331ms → 164ms). 2026-08-25 QA에서 원본 2쪽이 빈 표로 보였다.
//
// 데스크톱 앱은 오프라인·CSP 때문에 CDN을 쓸 수 없으므로 번들에 넣는다.
// node_modules를 단일 출처로 삼아 pdfjs-dist 버전과 어긋나지 않게 한다.
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts'] as const;

const pdfjsAssets = (): Plugin => {
  // 윈도우에서는 URL.pathname이 "/D:/a/FE/..." 로 나와 join이 드라이브를 겹쳐 붙인다
  // ("D:\\D:\\a\\...") — 파일을 읽을 때는 반드시 fileURLToPath로 바꿔 쓴다.
  const rootOf = (dir: string) =>
    fileURLToPath(
      new URL(`./node_modules/pdfjs-dist/${dir}/`, import.meta.url),
    );

  return {
    name: 'semojum:pdfjs-assets',

    // 개발 서버: /pdfjs/<dir>/<file> 요청을 node_modules에서 바로 읽어 준다.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/pdfjs\/(cmaps|standard_fonts)\/([\w.-]+)$/.exec(
          (req.url ?? '').split('?')[0],
        );
        if (!match) return next();
        const [, dir, file] = match;
        const path = join(rootOf(dir), file);
        if (!existsSync(path)) return next();
        res.setHeader(
          'Content-Type',
          extname(file) === '.bcmap' ? 'application/octet-stream' : 'font/otf',
        );
        createReadStream(join(rootOf(dir), file))
          .on('error', next)
          .pipe(res);
      });
    },

    // 빌드: dist/pdfjs/<dir>/ 아래로 그대로 복사한다.
    generateBundle() {
      for (const dir of PDFJS_ASSET_DIRS) {
        const root = rootOf(dir);
        for (const file of readdirSync(root)) {
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${dir}/${file}`,
            source: readFileSync(join(root, file)),
          });
        }
      }
    },
  };
};

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets()],
  resolve: { alias },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
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
