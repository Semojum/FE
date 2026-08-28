// 개발자 모드 — 버전 배지를 일곱 번 눌러 들어가고, 같은 방법으로 나온다.
//
// 왜 두는가: 현장에서 "느리다 / 무겁다"는 제보가 올 때, 진단 로그(diagLog)만으로는
// 그 순간 앱이 실제로 얼마를 쓰고 있었는지 알 수 없다. 2026-08-27 인수시험에서
// JS 힙이 7MB일 때 렌더러 프로세스가 1.2GB였던 것처럼, 웹뷰 안에서 보이는 값과
// 실제 사용량이 크게 어긋난다. 그래서 네이티브 계측을 화면 구석에 띄운다.
//
// 배포판에서도 켤 수 있게 둔다 — 문제는 개발 PC가 아니라 현장에서 난다.

const KEY = 'semojum.devMode';

// 버전 배지를 몇 번 눌러야 물어보는지. 실수로 눌러 들어가지 않을 만큼만.
export const DEV_MODE_CLICKS = 7;
// 연타로 인정하는 간격 — 이보다 뜸하면 처음부터 다시 센다.
export const DEV_MODE_CLICK_WINDOW_MS = 1500;

export const loadDevMode = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const saveDevMode = (on: boolean): void => {
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    /* 저장소를 못 쓰면 이번 실행에만 적용된다 — 개발 보조 기능이라 그걸로 충분하다. */
  }
};

// ── 빌드 구분 ────────────────────────────────────────────────
//
// 3.2.1까지가 프로덕션이고 3.3.0은 개발 중이다. 개발 빌드는
// `tauri.dev.conf.json`이 productName·identifier를 따로 줘서 프로덕션과 나란히
// 설치된다(설치 경로·설정·웹뷰 데이터가 전부 분리된다). 화면에서도 구분되어야
// 어느 앱을 보고 있는지 헷갈리지 않는다.
export type BuildChannel = 'production' | 'development';

let cachedChannel: BuildChannel | null = null;

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * 지금 실행 중인 것이 개발 빌드인지. productName으로 가른다 —
 * 개발 빌드만 이름에 "(개발)"이 붙는다(tauri.dev.conf.json).
 * 브라우저(vite dev)로 띄운 렌더러는 늘 개발로 본다.
 */
export const getBuildChannel = async (): Promise<BuildChannel> => {
  if (cachedChannel) return cachedChannel;
  if (!isTauri()) {
    cachedChannel = 'development';
    return cachedChannel;
  }
  try {
    const { getName } = await import('@tauri-apps/api/app');
    const name = await getName();
    cachedChannel = name.includes('개발') ? 'development' : 'production';
  } catch {
    cachedChannel = 'production';
  }
  return cachedChannel;
};
