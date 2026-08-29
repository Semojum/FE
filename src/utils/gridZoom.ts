// 판면 배율 — 모눈종이 칸을 얼마나 크게 그릴지.
//
// 칸이 19px로 고정이라 창을 키워도 판면은 그대로였다(2026-08-28 실측: 결과 패널
// 1,644px 중 격자가 638px만 쓰고 1,006px이 빈 자리였다). 점역사는 점형을 눈으로
// 읽어야 하므로 남는 폭은 칸을 키우는 데 쓰는 편이 낫다.
//
// 'fit' = 패널 폭에 맞춰 자동. 숫자를 고르면 그 배율로 고정된다.

const KEY = 'semojum.gridZoom';

export type GridZoom = 'fit' | number;

export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 3;
/** 폭 맞춤이 지나치게 커지지 않도록 — 초대형 모니터에서 칸이 손바닥만 해진다. */
export const ZOOM_FIT_MAX = 2.2;
export const ZOOM_STEP = 0.15;

export const clampZoom = (v: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100));

export const loadGridZoom = (): GridZoom => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw || raw === 'fit') return 'fit';
    const n = Number(raw);
    return Number.isFinite(n) ? clampZoom(n) : 'fit';
  } catch {
    return 'fit';
  }
};

export const saveGridZoom = (v: GridZoom): void => {
  try {
    window.localStorage.setItem(KEY, v === 'fit' ? 'fit' : String(v));
  } catch {
    /* 저장 실패는 이번 실행에만 영향을 준다 */
  }
};

export const describeZoom = (v: GridZoom, resolved: number): string =>
  v === 'fit' ? `폭 맞춤 ${Math.round(resolved * 100)}%` : `${Math.round(resolved * 100)}%`;
