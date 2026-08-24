// 6점 입력 — 점역사가 쓰는 표준 방식(퍼킨스 타법)으로 점형을 직접 찍는다.
//
// 앱 안에서 점자를 넣는 방법은 하나여야 한다. 판면 격자(출력란)와 찾기·바꾸기
// 입력칸이 같은 규칙을 쓰도록 여기 한 곳에 둔다.
//  · 키는 자판 배열과 무관하게 e.code로 본다 — 한글 자판에서도 손 위치가 같다
//  · 여러 점을 화음처럼 함께 누르고 **떼는 순간** 한 글자로 합친다
//  · 유니코드 점자는 ⠀(U+2800)에 점 비트를 더한 값이다

export const BRAILLE_BASE = 0x2800;

// e.code → 점 비트
export const BRAILLE_DOT_MAP: Record<string, number> = {
  KeyF: 1, // 1점
  KeyD: 2, // 2점
  KeyS: 4, // 3점
  KeyJ: 8, // 4점
  KeyK: 16, // 5점
  KeyL: 32, // 6점
};

export const isDotCode = (code: string): boolean => code in BRAILLE_DOT_MAP;

// 함께 눌린 키들을 점형 한 글자로. 아무 점도 없으면 빈 칸(⠀).
export const codesToCell = (codes: Iterable<string>): string => {
  let bits = 0;
  for (const code of codes) bits += BRAILLE_DOT_MAP[code] ?? 0;
  return String.fromCharCode(BRAILLE_BASE + bits);
};

export const isBrailleText = (text: string): boolean =>
  text.length > 0 &&
  [...text].every((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= BRAILLE_BASE && code <= BRAILLE_BASE + 0xff;
  });
