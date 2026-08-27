// 현장 진단 로그.
//
// 프로덕션 웹뷰의 console.error는 아무도 못 본다 — 기관 PC에서 "서버 오류가 떴다",
// "화면이 안 넘어간다" 같은 제보가 와도 재현 정보가 전혀 남지 않았다(2026-08-26 QA:
// 마이페이지 서버 오류 제보를 끝내 재현하지 못함). 그래서 잡히지 않은 오류와 주요
// 실패 지점을 로그 파일로 남긴다. 사용자는 문의 창의 "로그 폴더 열기"로 파일을 찾아
// 문의에 붙일 수 있다.
//
// 위치: $APPLOG/diag-YYYYMMDD.log (Windows: %LocalAppData%\<앱ID>\logs)
// 브라우저(개발 미리보기)에서는 파일 없이 콘솔로만 흘린다.

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// 홍수 방지 — 오류가 렌더 루프 안에서 터지면 같은 줄이 초당 수십 번 쌓인다.
const MAX_LINES_PER_SESSION = 400;
const DUPLICATE_WINDOW_MS = 5_000;
const MAX_DETAIL_CHARS = 2_000;
const KEEP_DAYS = 14;

let linesWritten = 0;
let lastLine = '';
let lastLineAt = 0;
// append 순서 보장 — 파일 쓰기가 겹치면 줄이 섞인다.
let writeChain: Promise<void> = Promise.resolve();

const timestamp = (): string => {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const fileNameFor = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `diag-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.log`;
};

// Error 객체는 JSON.stringify로 빈 객체가 되므로 따로 푼다. 순환 참조·거대 객체는
// 잘라서 로그 파일이 자라는 것을 막는다.
export const describeDetail = (detail: unknown): string => {
  if (detail === undefined) return '';
  let text: string;
  if (detail instanceof Error) {
    const stack = (detail.stack ?? '').split('\n').slice(0, 8).join(' « ');
    text = `${detail.name}: ${detail.message}${stack ? ` | ${stack}` : ''}`;
  } else if (typeof detail === 'string') {
    text = detail;
  } else {
    try {
      text = JSON.stringify(detail);
    } catch {
      text = String(detail);
    }
  }
  return text.length > MAX_DETAIL_CHARS
    ? `${text.slice(0, MAX_DETAIL_CHARS)}…(잘림)`
    : text;
};

const appendToFile = (line: string): void => {
  if (!isTauri()) return;
  writeChain = writeChain
    .then(async () => {
      const { writeTextFile, BaseDirectory } =
        await import('@tauri-apps/plugin-fs');
      await writeTextFile(fileNameFor(new Date()), line + '\n', {
        baseDir: BaseDirectory.AppLog,
        append: true,
      });
    })
    .catch(() => {
      // 로그를 못 쓴다고 앱을 방해하면 본말전도다. 조용히 버린다.
    });
};

/**
 * 진단 로그 한 줄. 콘솔에도 같이 흘리므로 console.error 대신 이걸 쓰면 된다.
 * scope는 어디서 났는지 찾는 열쇠다 — 'upload', 'sse', '화면 오류' 처럼 짧게.
 */
export const logDiag = (
  scope: string,
  message: string,
  detail?: unknown,
): void => {
  console.error(`[${scope}]`, message, detail ?? '');

  if (linesWritten >= MAX_LINES_PER_SESSION) return;
  const key = `${scope}|${message}`;
  const now = Date.now();
  if (key === lastLine && now - lastLineAt < DUPLICATE_WINDOW_MS) return;
  lastLine = key;
  lastLineAt = now;
  linesWritten += 1;

  const tail = describeDetail(detail);
  appendToFile(
    `${timestamp()} [${scope}] ${message}${tail ? ` — ${tail}` : ''}`,
  );
  if (linesWritten === MAX_LINES_PER_SESSION) {
    appendToFile(
      `${timestamp()} [diag] 세션 로그 한도(${MAX_LINES_PER_SESSION}줄) 도달 — 이후 생략`,
    );
  }
};

// 오래된 로그 정리 — 파일명이 diag-YYYYMMDD.log 라 사전순 비교가 곧 날짜 비교다.
const pruneOldLogs = async (): Promise<void> => {
  const { readDir, remove, BaseDirectory } =
    await import('@tauri-apps/plugin-fs');
  const cutoff = fileNameFor(
    new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000),
  );
  const entries = await readDir('', { baseDir: BaseDirectory.AppLog });
  for (const e of entries) {
    if (/^diag-\d{8}\.log$/.test(e.name) && e.name < cutoff) {
      await remove(e.name, { baseDir: BaseDirectory.AppLog }).catch(() => {});
    }
  }
};

/** 문의 창에서 로그 폴더를 여는 데 쓴다. 브라우저에서는 null. */
export const openDiagLogFolder = async (): Promise<boolean> => {
  if (!isTauri()) return false;
  try {
    const [{ appLogDir }, { openPath }] = await Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-opener'),
    ]);
    await openPath(await appLogDir());
    return true;
  } catch (e) {
    logDiag('diag', '로그 폴더 열기 실패', e);
    return false;
  }
};

/**
 * 앱 시작 시 한 번. 전역 오류 두 종류(동기 예외·잡히지 않은 프라미스 거부)를 걸고
 * 세션 시작 줄을 남긴다. 시작 줄은 버전·환경이 실려 있어 제보 대조의 기준점이 된다.
 */
export const initDiagLog = (): void => {
  window.addEventListener('error', (event) => {
    // 리소스 로드 실패(img 등)는 ErrorEvent가 아니어서 message가 없다 — 건너뛴다.
    if (!event.message) return;
    logDiag(
      '전역',
      event.message,
      event.error ?? `${event.filename}:${event.lineno}`,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    logDiag('전역', '처리되지 않은 프라미스 거부', event.reason);
  });
  // CSP(tauri.conf.json security.csp)에 막힌 요청. 막히면 화면에는 그림이 안 뜨거나
  // 요청이 조용히 실패할 뿐 오류가 안 난다 — 새 호스트(예: 저장소 버킷 변경)를
  // CSP에 빠뜨렸을 때 현장에서 알아챌 유일한 단서다.
  window.addEventListener('securitypolicyviolation', (event) => {
    logDiag(
      'CSP',
      `${event.violatedDirective} 차단`,
      `${event.blockedURI} @ ${event.sourceFile || event.documentURI}:${event.lineNumber}`,
    );
  });

  if (!isTauri()) return;
  writeChain = writeChain.then(async () => {
    const { mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await mkdir('', { baseDir: BaseDirectory.AppLog, recursive: true }).catch(
      () => {},
    );
    const version = await import('@tauri-apps/api/app')
      .then((m) => m.getVersion())
      .catch(() => '?');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(
      fileNameFor(new Date()),
      `${timestamp()} [세션] 시작 v${version} · ${navigator.userAgent} · ${screen.width}×${screen.height}\n`,
      { baseDir: BaseDirectory.AppLog, append: true },
    );
    await pruneOldLogs().catch(() => {});
  });
  writeChain = writeChain.catch(() => {});
};
