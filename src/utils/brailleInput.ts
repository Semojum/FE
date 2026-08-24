// 6점 입력 — 점역사가 쓰는 표준 방식(F D S · J K L)으로 점형을 직접 찍는다.
//
// 로컬에는 묵자→점자 번역기가 없다(vendor/braille-assist는 조판만 한다). 그래서
// 찾기 창에서 점자를 찾으려면 점형을 그대로 받아야 하는데, 붙여넣기만으로는
// 앱 안에서 점형을 만들 방법이 없다. 여섯 손가락 자리로 점을 찍어 한 칸씩 확정한다.
//
// 유니코드 점자는 ⠀(U+2800)에 점 번호별 비트를 더한 값이다.
//   1점 1 · 2점 2 · 3점 4 · 4점 8 · 5점 16 · 6점 32

const BRAILLE_BASE = 0x2800;

// 왼손 F D S = 1·2·3점, 오른손 J K L = 4·5·6점 (점자 타자기 배열).
export const DOT_KEYS: Record<string, number> = {
  f: 1,
  d: 2,
  s: 3,
  j: 4,
  k: 5,
  l: 6,
};

export const isDotKey = (key: string): boolean => key.toLowerCase() in DOT_KEYS;

export const toggleDot = (dots: Set<number>, key: string): Set<number> => {
  const dot = DOT_KEYS[key.toLowerCase()];
  if (!dot) return dots;
  const next = new Set(dots);
  if (next.has(dot)) next.delete(dot);
  else next.add(dot);
  return next;
};

// 찍어 둔 점들을 한 칸(유니코드 점자 문자)으로 만든다. 아무 점도 없으면 빈 칸(⠀).
export const dotsToCell = (dots: Set<number>): string => {
  let bits = 0;
  dots.forEach((dot) => {
    if (dot >= 1 && dot <= 6) bits |= 1 << (dot - 1);
  });
  return String.fromCharCode(BRAILLE_BASE + bits);
};

// 한 칸을 다시 점 번호로 — 붙여넣은 점자를 이어서 고칠 때 쓴다.
export const cellToDots = (cell: string): Set<number> => {
  const code = cell.codePointAt(0);
  if (code == null || code < BRAILLE_BASE || code > BRAILLE_BASE + 0xff) {
    return new Set();
  }
  const bits = code - BRAILLE_BASE;
  const dots = new Set<number>();
  for (let dot = 1; dot <= 6; dot++) {
    if (bits & (1 << (dot - 1))) dots.add(dot);
  }
  return dots;
};

export const isBrailleText = (text: string): boolean =>
  text.length > 0 &&
  [...text].every((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= BRAILLE_BASE && code <= BRAILLE_BASE + 0xff;
  });
