// 조판 설정 — 1차 PoC(2026-08-26 한국점자도서관)에서 받은 요청을 담는 자리.
//
// 조판 규칙 자체는 Semojum/braille-assist가 단일 출처다. FE는 규칙을 다시 구현하지
// 않고 **그 라이브러리가 이미 받는 옵션을 화면에 노출**하기만 한다.
// (README: "조판 규칙을 FE에서 고치지 말 것")
//
// 미팅 요청 ↔ 라이브러리 옵션 대응:
//   32×26 규격 변경          → cols · rows
//   페이지행 전체/홀수/없음   → pageRowOn ('every' | 'odd' | 'none')
//   표지 제외(시작 쪽 지정)   → coverPages
//   원본/점자 쪽번호 표시     → showOrigPage · showBraillePage
//   꼬리말 정렬(중앙/우측)    → ✗ 라이브러리에 없다. footerAlign은 여기 담아 두되
//                              실제 적용은 braille-assist PR이 필요하다(아래 주석).
import { DEFAULT_OPTIONS } from '@semojum/braille-assist';

export type PageRowOn = 'every' | 'odd' | 'none';
export type FooterAlign = 'center' | 'right';

export interface TypesetOptions {
  /** 한 줄 칸 수 (기본 32) */
  cols: number;
  /** 한 면 줄 수 (기본 26) */
  rows: number;
  /** 페이지행을 넣는 면 — 전체 / 홀수 면만 / 넣지 않음 */
  pageRowOn: PageRowOn;
  /** 앞쪽 몇 면을 표지로 보고 쪽 번호를 매기지 않을지 */
  coverPages: number;
  /** 페이지행에 원본 쪽 번호를 넣을지 */
  showOrigPage: boolean;
  /** 페이지행에 점자 면 번호를 넣을지 */
  showBraillePage: boolean;
  /**
   * 꼬리말 정렬. 지침 기준 가운데 정렬만 braille-assist에 구현돼 있고,
   * 우측 정렬은 아직 없다 — 고르면 화면·다운로드 모두 가운데로 나온다.
   * (docs/SERVER-REQUIREMENTS-3.3.0.md "L-1" 참고)
   */
  footerAlign: FooterAlign;
  /** 꼬리말 본문(묵자). 점역은 서버가 한다. */
  footerText: string;
}

export const DEFAULT_TYPESET: TypesetOptions = {
  cols: DEFAULT_OPTIONS.cols,
  rows: DEFAULT_OPTIONS.rows,
  pageRowOn: 'odd',
  coverPages: 0,
  showOrigPage: true,
  showBraillePage: true,
  footerAlign: 'center',
  footerText: '',
};

// 규격은 지침·장비 한계 안에서만 받는다. 8칸 미만은 라이브러리가 거부하고,
// 지나치게 큰 값은 판면이 화면을 벗어나 편집이 불가능해진다.
export const COLS_MIN = 8;
export const COLS_MAX = 48;
export const ROWS_MIN = 4;
export const ROWS_MAX = 40;

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

export const normalizeTypeset = (
  raw: Partial<TypesetOptions> | null | undefined,
): TypesetOptions => {
  const v = raw ?? {};
  return {
    cols: clampInt(v.cols, COLS_MIN, COLS_MAX, DEFAULT_TYPESET.cols),
    rows: clampInt(v.rows, ROWS_MIN, ROWS_MAX, DEFAULT_TYPESET.rows),
    pageRowOn: (['every', 'odd', 'none'] as const).includes(v.pageRowOn as PageRowOn)
      ? (v.pageRowOn as PageRowOn)
      : DEFAULT_TYPESET.pageRowOn,
    coverPages: clampInt(v.coverPages, 0, 99, DEFAULT_TYPESET.coverPages),
    showOrigPage: v.showOrigPage !== false,
    showBraillePage: v.showBraillePage !== false,
    footerAlign: v.footerAlign === 'right' ? 'right' : 'center',
    footerText: typeof v.footerText === 'string' ? v.footerText : '',
  };
};

/** 규격이 기본값(32×26)에서 벗어났는지 — 화면에 눈에 띄게 알리는 데 쓴다. */
export const isNonStandardSize = (o: TypesetOptions): boolean =>
  o.cols !== DEFAULT_OPTIONS.cols || o.rows !== DEFAULT_OPTIONS.rows;

/** 사람이 읽는 한 줄 요약 — 변환 설정·마이페이지에서 같은 문구를 쓴다. */
export const describeTypeset = (o: TypesetOptions): string => {
  const parts = [`${o.rows}줄 × ${o.cols}칸`];
  parts.push(
    o.pageRowOn === 'none'
      ? '페이지행 없음'
      : o.pageRowOn === 'every'
        ? '페이지행 전체 면'
        : '페이지행 홀수 면',
  );
  if (o.coverPages > 0) parts.push(`표지 ${o.coverPages}면 제외`);
  if (o.footerText) parts.push(`꼬리말 "${o.footerText}"`);
  return parts.join(' · ');
};
