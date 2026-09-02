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
//   꼬리말 정렬(중앙/우측)    → footerAlign
//   원본 쪽 변경선 켜기·끄기  → showChangeLine
// (뒤 둘은 2026-09-02 braille-assist 갱신으로 열렸다 — 그전에는 "준비 중"이었다)
import { DEFAULT_OPTIONS } from '@semojum/braille-assist';

export type PageRowOn = 'every' | 'odd' | 'none';
export type FooterAlign = 'center' | 'right';
export type FooterScope = 'rest' | 'page';

export interface TypesetOptions {
  /** 한 줄 칸 수 (기본 32) */
  cols: number;
  /** 한 면 줄 수 (기본 26) */
  rows: number;
  /** 페이지행을 넣는 면 — 전체 / 홀수 면만 / 넣지 않음 */
  pageRowOn: PageRowOn;
  /** 앞쪽 몇 면을 표지로 보고 쪽 번호를 매기지 않을지 */
  coverPages: number;
  /**
   * 점자 면 번호를 몇 번부터 셀지. 표지를 따로 찍어 붙이거나 권을 나눠 낼 때
   * 1이 아닌 번호에서 시작한다(1차 PoC 1-2 기능2 "시작 페이지 지정").
   * `coverPages`(표지 범위는 페이지행 생략)와는 다른 축이다.
   */
  startBraillePage: number;
  /** 페이지행에 원본 쪽 번호를 넣을지 */
  showOrigPage: boolean;
  /**
   * 첫 원본 쪽을 몇 번으로 셀지. 표지·속표지를 뺀 채 스캔했거나 책 중간부터
   * 올릴 때 실제 쪽 번호와 맞춘다(1차 PoC 1-4 기능1).
   * 편집 좌표(어느 블록의 몇 번째 줄인지)는 건드리지 않는다 — 표기만 옮긴다.
   */
  origPageStart: number;
  /**
   * 고급 점역 사용 여부 — 복잡한 문서에 더 좋은 모델을 쓴다.
   * (1차 PoC "복잡한 문서 처리를 위한 고급 AI 모델 사용 버튼" · 명세 advancedAi)
   */
  advancedAi: boolean;
  /**
   * 원본 페이지가 바뀌는 자리에 변경선을 넣을지.
   *
   * 2026-09-02 braille-assist 갱신으로 `Options.showChangeLine`이 생겨 **화면 조판은**
   * 열렸다. 끄는 판단은 라이브러리가 한다 — 원본 쪽 번호를 끄면 변경선은 ⠤만 남은
   * 빈 줄이라 함께 꺼진다(라이브러리 결정 D).
   *
   * ⏳ 서버 조판 옵션(V30)에는 아직 이 항목이 없다 — BE에 추가를 요청해 둔 상태다
   * (docs/서버_요청사항.pdf A-1). 아래 toLayoutOptions가 이미 함께 보내고
   * fromLayoutOptions가 읽으므로, **서버가 받기 시작하면 FE는 고칠 것이 없다.**
   * 그때까지는 번호를 켠 채 변경선만 끈 상태가 화면에만 적용된다(파일엔 남는다).
   */
  showChangeLine: boolean;

  /** 페이지행에 점자 면 번호를 넣을지 */
  showBraillePage: boolean;
  /**
   * 꼬리말 정렬. 2026-09-02 braille-assist 갱신으로 우측 정렬이 들어왔다 —
   * 점자 면 번호에서 두 칸 띄운 자리가 오른쪽 끝이다(`pageRow`).
   */
  footerAlign: FooterAlign;
  /** 꼬리말 본문(묵자). 점역은 서버가 한다. */
  footerText: string;
  /**
   * 판면에서 꼬리말을 고칠 때의 기본 적용 범위.
   * 'rest' = 그 자리부터 뒤 전부, 'page' = 그 면 하나만.
   * (1차 PoC 1-3 기능2 — "해당 페이지만 / 이후 페이지 전부 중 선택,
   *  마이페이지의 점역 기본 설정에 추가할 것")
   */
  footerScope: FooterScope;
}

export const DEFAULT_TYPESET: TypesetOptions = {
  cols: DEFAULT_OPTIONS.cols,
  rows: DEFAULT_OPTIONS.rows,
  pageRowOn: 'odd',
  coverPages: 0,
  startBraillePage: 1,
  showOrigPage: true,
  origPageStart: 1,
  showChangeLine: true,
  advancedAi: false,
  showBraillePage: true,
  footerAlign: 'center',
  footerText: '',
  footerScope: 'rest',
};

// 규격은 지침·장비 한계 안에서만 받는다. 8칸 미만은 라이브러리가 거부하고,
// 지나치게 큰 값은 판면이 화면을 벗어나 편집이 불가능해진다.
// 서버가 받는 범위와 같게 둔다 — 넘기면 업로드에서 COMMON4000으로 막힌다
// (V3 API 명세 "조판 옵션 V30": cellsPerLine 8~100 · linesPerPage 4~100).
export const COLS_MIN = 8;
export const COLS_MAX = 100;
export const ROWS_MIN = 4;
export const ROWS_MAX = 100;
// 점자 면 번호 시작값. 권을 나눠 내도 네 자리를 넘길 일은 없다.
export const START_PAGE_MIN = 1;
export const START_PAGE_MAX = 999;

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
    startBraillePage: clampInt(
      v.startBraillePage,
      START_PAGE_MIN,
      START_PAGE_MAX,
      DEFAULT_TYPESET.startBraillePage,
    ),
    showOrigPage: v.showOrigPage !== false,
    origPageStart: clampInt(
      v.origPageStart,
      START_PAGE_MIN,
      START_PAGE_MAX,
      DEFAULT_TYPESET.origPageStart,
    ),
    // 원본 페이지 번호를 끄면 변경선에 적을 번호가 없다 — 함께 꺼진다.
    showChangeLine: v.showOrigPage !== false && v.showChangeLine !== false,
    advancedAi: v.advancedAi === true,
    showBraillePage: v.showBraillePage !== false,
    footerAlign: v.footerAlign === 'right' ? 'right' : 'center',
    footerText: typeof v.footerText === 'string' ? v.footerText : '',
    footerScope: v.footerScope === 'page' ? 'page' : 'rest',
  };
};

// ── 꼬리말 길이 ────────────────────────────────────────────
//
// 1차 PoC(2026-08-26) 피드백: "꼬리말 길이 검증 필요(32칸 중 30칸 이상이면 버그 발생)".
// 페이지행 한 줄에는 원본 쪽 번호(왼쪽)·점자 면 번호(오른쪽)가 먼저 자리를 잡고,
// 항목 사이는 두 칸 이상 띄운다(지침 1장3-1). 꼬리말은 그 사이에 들어가고, 넘치면
// 뒤가 잘린다(braille-assist `pageRow`). 그래서 몇 자까지 되는지 화면에서 미리 알린다.
//
// ⚠ FE는 점역을 하지 않으므로 정확한 칸 수는 알 수 없다 — 어림값이다. 실제 검증은
//    점역한 뒤에 서버가 한다(docs/SERVER-REQUIREMENTS-3.3.0.md).

// 쪽 번호가 쓰는 칸 — `#` + 세 자리까지 보고, 이어지는 면 표시(a·b…) 한 칸을 더 본다.
const PAGE_NO_CELLS = 5;
// 항목 사이 띄우기 두 칸.
const GAP_CELLS = 2;

/** 페이지행에서 꼬리말이 쓸 수 있는 칸 수(어림). */
export const footerCellBudget = (o: TypesetOptions): number => {
  const left = o.showOrigPage ? PAGE_NO_CELLS + GAP_CELLS : 0;
  const right = o.showBraillePage ? PAGE_NO_CELLS + GAP_CELLS : 0;
  return Math.max(0, o.cols - left - right);
};

// 한글 한 글자는 점자로 두세 칸을 쓴다(초성+중성, 받침이 있으면 한 칸 더).
// 잘리는 것을 놓치는 쪽이 나쁘므로 넉넉한 쪽(3칸)으로 센다.
const HANGUL = /[가-힣]/;

/** 묵자 꼬리말이 점자로 몇 칸이 될지(어림). */
export const estimateFooterCells = (footer: string): number =>
  [...footer.trim()].reduce((n, ch) => n + (HANGUL.test(ch) ? 3 : 1), 0);

/** 페이지행에 다 들어가지 못할 것 같으면 알림 문구, 넉넉하면 null. */
export const footerOverflowHint = (o: TypesetOptions): string | null => {
  const budget = footerCellBudget(o);
  const cells = estimateFooterCells(o.footerText);
  if (cells <= budget) return null;
  return `페이지행에 들어갈 자리는 약 ${budget}칸인데 이 꼬리말은 약 ${cells}칸입니다 — 뒤가 잘릴 수 있습니다.`;
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
  if (o.startBraillePage !== 1) parts.push(`${o.startBraillePage}면부터`);
  if (o.origPageStart !== 1) parts.push(`원본 ${o.origPageStart}페이지부터`);
  if (o.advancedAi) parts.push('고급 점역');
  if (o.footerText) parts.push(`꼬리말 "${o.footerText}"`);
  return parts.join(' · ');
};

// ── 서버 계약(V3 API "조판 옵션 V30" · 2026-09-01) ──────────────
//
// 업로드 폼과 조회 응답이 쓰는 이름은 화면 쪽 이름과 다르다. 두 이름을 한 곳에서만
// 잇고, 나머지 코드는 화면 이름만 쓴다 — 서버가 필드를 바꿔도 여기만 고치면 된다.
//
// 저장은 jobs.layout_options(jsonb) 한 칸이라 **모르는 필드는 서버가 무시한다.**
// 그래서 화면에만 있는 값(footerScope → editScope처럼 서버가 되돌려주기만 하는 것)도
// 함께 보내 둘 수 있다.

export interface LayoutOptions {
  cellsPerLine: number;
  linesPerPage: number;
  pageNumberLine: PageRowOn;
  coverPages: number;
  sourcePageStart: number;
  braillePageStart: number;
  showSourcePageNumber: boolean;
  showBraillePageNumber: boolean;
  footerAlign: FooterAlign;
  /**
   * 원본 페이지 변경선을 넣을지.
   *
   * ⚠ **서버 명세(V30)에 없는 항목이다.** 서버가 받기 시작하면 그대로 붙도록 미리
   * 보내 두지만, 지금은 무시되고 조회 응답에도 오지 않는다(그래서 다시 열면 기본값).
   */
  showChangeLine: boolean;
  /** 판면 수정 기본 적용 범위 — 서버는 저장·반환만 하고 쓰는 것은 FE다. */
  editScope: 'all' | 'page';
  advancedAi: boolean;
}

/** 화면 설정 → 업로드 폼·저장 값. */
export const toLayoutOptions = (o: TypesetOptions): LayoutOptions => ({
  cellsPerLine: o.cols,
  linesPerPage: o.rows,
  pageNumberLine: o.pageRowOn,
  coverPages: o.coverPages,
  sourcePageStart: o.origPageStart,
  braillePageStart: o.startBraillePage,
  showSourcePageNumber: o.showOrigPage,
  showBraillePageNumber: o.showBraillePage,
  footerAlign: o.footerAlign,
  showChangeLine: o.showChangeLine,
  editScope: o.footerScope === 'page' ? 'page' : 'all',
  advancedAi: o.advancedAi,
});

/**
 * 서버가 준 조판 옵션 → 화면 설정.
 *
 * 명세상 응답은 늘 완전한 형태지만(안 보낸 항목도 기본값이 채워져 온다), 배포본이
 * 명세와 어긋난 전례가 있어 normalizeTypeset으로 한 번 더 거른다. 꼬리말은 옵션
 * 바깥(footerText)에 따로 오므로 인자로 받는다.
 */
export const fromLayoutOptions = (
  raw: Partial<LayoutOptions> | null | undefined,
  footerText?: string | null,
): TypesetOptions => {
  const v = raw ?? {};
  return normalizeTypeset({
    cols: v.cellsPerLine,
    rows: v.linesPerPage,
    pageRowOn: v.pageNumberLine,
    coverPages: v.coverPages,
    origPageStart: v.sourcePageStart,
    startBraillePage: v.braillePageStart,
    showOrigPage: v.showSourcePageNumber,
    showBraillePage: v.showBraillePageNumber,
    footerAlign: v.footerAlign,
    showChangeLine: v.showChangeLine,
    footerScope: v.editScope === 'page' ? 'page' : 'rest',
    advancedAi: v.advancedAi,
    footerText: footerText ?? '',
  });
};
