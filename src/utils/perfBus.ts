// 개발자 모드 오버레이가 읽는 계측 버스.
//
// 앱 곳곳에서 "이만큼 걸렸다"를 여기에 흘려보내고, 오버레이가 구독해 그린다.
// 개발자 모드가 꺼져 있어도 기록은 계속한다 — 느려진 뒤에 켜도 직전 상황이 남아
// 있어야 쓸모가 있다. 대신 링 버퍼로 상한을 둬서 이 기능 자체가 메모리를 먹지 않게 한다.

const KEEP = 40;

export interface HttpSample {
  t: number;
  /** 사람이 알아볼 만큼만 남긴 경로 (쿼리·토큰 제거) */
  label: string;
  /** 첫 바이트까지(ms) — 응답 헤더가 도착한 시각 */
  ttfb: number;
  /** 본문까지 다 읽은 시각은 스트리밍(SSE)에서 의미가 없어 재지 않는다 */
  status: number;
  ok: boolean;
}

export interface OpSample {
  t: number;
  name: string;
  ms: number;
}

const http: HttpSample[] = [];
const ops: OpSample[] = [];
const listeners = new Set<() => void>();

let notifyScheduled = false;
const notify = () => {
  // 요청이 몰릴 때마다 구독자를 깨우면 오버레이가 초당 수십 번 다시 그려진다.
  if (notifyScheduled) return;
  notifyScheduled = true;
  const run = () => {
    notifyScheduled = false;
    listeners.forEach((l) => l());
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
};

const push = <T>(arr: T[], v: T) => {
  arr.push(v);
  if (arr.length > KEEP) arr.shift();
  notify();
};

/** URL에서 사람이 읽을 부분만 — 서명 URL의 토큰이 화면에 남지 않게 한다. */
export const labelOf = (url: string): string => {
  try {
    const u = url.startsWith('http') ? new URL(url) : null;
    const path = u ? u.pathname : url.split('?')[0];
    const host = u ? u.host : '';
    if (host.includes('ipc.localhost')) return 'ipc:' + decodeURIComponent(path).replace(/^\/plugin:/, '');
    if (host && !host.includes('semojum')) return `${host}${path}`.slice(0, 48);
    return path.slice(0, 48);
  } catch {
    return url.slice(0, 48);
  }
};

export const recordHttp = (s: HttpSample): void => push(http, s);
export const recordOp = (name: string, ms: number): void =>
  push(ops, { t: Date.now(), name, ms: Math.round(ms) });

/** 시작 시각을 받아 지금까지를 기록한다. `const t = now(); … endOp('조판', t)` */
export const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();
export const endOp = (name: string, startedAt: number): void =>
  recordOp(name, now() - startedAt);

export const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export interface PerfBusSnapshot {
  http: HttpSample[];
  ops: OpSample[];
  /** 최근 요청들의 TTFB 중앙값 — 한 건이 튀어도 흔들리지 않게 */
  ttfbMedian: number | null;
  ttfbLast: number | null;
  failures: number;
}

export const readBus = (): PerfBusSnapshot => {
  const oks = http.filter((h) => h.ok).map((h) => h.ttfb).sort((a, b) => a - b);
  const mid = oks.length ? oks[Math.floor(oks.length / 2)] : null;
  return {
    http: [...http],
    ops: [...ops],
    ttfbMedian: mid === undefined ? null : mid,
    ttfbLast: http.length ? http[http.length - 1].ttfb : null,
    failures: http.filter((h) => !h.ok).length,
  };
};
