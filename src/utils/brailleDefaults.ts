import { ConversionTab, TABS, TAB_VALUES } from '../types';

// Figma V3-06 사용량(T3) "점역 기본 설정" — 새 작업이 시작할 기본값.
//
// 서버에는 계정 설정 API가 없다(V3 API 명세에 users/settings 계열 없음). 그래서
// 이 값은 이 기기에만 저장한다. 토큰과 달리 계정 식별 정보가 아니므로 localStorage에
// 남겨도 자동 로그인 정책(UseAuth 주석)과 충돌하지 않는다.
//
// 실제로 적용되는 것은 여기 있는 세 가지뿐이다:
//  · defaultMode  → 앱을 켰을 때 열리는 탭
//  · insertPageNumber → 변환 설정 모달(V3-02)의 쪽번호 삽입 초기값
//  · footerText   → 같은 모달의 꼬리말 초기값
// 표·글상자 테두리, 그림 생략 표시, 점역자 주 시작 칸은 서버·AI 조판 규칙이라
// 앱에서 바꿀 수 없어 화면에도 읽기 전용으로 둔다.

const KEY = 'semojum.brailleDefaults';

export interface BrailleDefaults {
  // 새 작업을 시작할 탭 (a: 초안 생성 / b: 텍스트 점자 번역 / c: 이미지 점자 번역)
  defaultMode: ConversionTab;
  // 쪽번호 삽입 — 판면 마지막 줄을 쪽번호로 쓸지
  insertPageNumber: boolean;
  // 꼬리말(묵자) 기본 문구
  footerText: string;
}

export const DEFAULT_BRAILLE_DEFAULTS: BrailleDefaults = {
  defaultMode: TABS.OCR,
  insertPageNumber: false,
  footerText: '',
};

const isTab = (v: unknown): v is ConversionTab =>
  TAB_VALUES.includes(v as ConversionTab);

export const loadBrailleDefaults = (): BrailleDefaults => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BRAILLE_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<BrailleDefaults>;
    return {
      defaultMode: isTab(parsed.defaultMode)
        ? parsed.defaultMode
        : DEFAULT_BRAILLE_DEFAULTS.defaultMode,
      insertPageNumber: parsed.insertPageNumber === true,
      footerText:
        typeof parsed.footerText === 'string' ? parsed.footerText : '',
    };
  } catch {
    // 저장소를 못 읽는 환경(권한·손상)에서도 앱은 그대로 뜬다.
    return DEFAULT_BRAILLE_DEFAULTS;
  }
};

export const saveBrailleDefaults = (value: BrailleDefaults): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* 저장 실패는 조용히 넘긴다 — 다음 실행에 기본값으로 돌아갈 뿐이다. */
  }
};
