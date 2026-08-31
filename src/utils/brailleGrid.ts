import { CELLS_PER_ROW } from './brailleLayout';

// 격자 한 행 안에서의 셀 편집.
//
// 판면 배치(32칸 줄바꿈 · 변경선 · 면 나눔 · 페이지행)는 braille-assist가 하고
// `brailleLayout`이 그 결과를 행 목록으로 만든다. 여기 있는 것은 그 한 행의 문자열을
// 어떻게 고치느냐뿐이다.

// 한 글자를 한 칸에 넣는다. 32칸을 넘는 부분은 잘라 보여주고(저장값은 건드리지 않는다),
// 모자라면 빈 칸으로 채운다. 본문 행은 이미 32칸으로 접혀 오므로 잘릴 일이 없다.
export const toCells = (text: string, cells = CELLS_PER_ROW): string[] => {
  const chars = [...text].slice(0, cells);
  return [...chars, ...Array(Math.max(0, cells - chars.length)).fill('')];
};

// 통 문자열을 판면과 같은 규칙(32칸에서 그대로 자름 · \n은 무조건 개행)으로 접는다.
// 잘라 내지 않는다 — 대체 텍스트 창처럼 전문을 보여 주는 곳에서 쓴다.
// 판면 배치를 대신하지는 않는다(최종 조판은 braille-assist가 한다).
export const wrapRows = (text: string, cells = CELLS_PER_ROW): string[] => {
  const rows: string[] = [];
  for (const line of text.split('\n')) {
    const chars = [...line];
    // 빈 줄도 한 줄을 차지한다.
    if (chars.length === 0) rows.push('');
    for (let i = 0; i < chars.length; i += cells) {
      rows.push(chars.slice(i, i + cells).join(''));
    }
  }
  return rows;
};

// 앞 maxRows 줄만 — 좁은 자리에 맛보기로 걸 때.
export const previewRows = (
  text: string,
  maxRows: number,
  cells = CELLS_PER_ROW,
): string[] => wrapRows(text, cells).slice(0, maxRows);

// 격자 편집은 "밀어쓰기"다 — 커서 칸에 글자를 끼워 넣고 뒤쪽 글자는 오른쪽으로 밀린다.
// 그 결과 행이 32칸을 넘으면 조판이 다음 행으로 접는다.
export const insertAt = (
  text: string,
  index: number,
  input: string,
): string => {
  const chars = [...text];
  // 커서가 줄 끝보다 뒤면 사이를 공백으로 메운 뒤 끼워 넣는다.
  while (chars.length < index) chars.push(' ');
  chars.splice(index, 0, ...[...input]);
  return chars.join('');
};

// Backspace — 커서 앞 글자를 지우고 뒤쪽을 왼쪽으로 당긴다.
export const deleteBefore = (text: string, index: number): string => {
  if (index <= 0) return text;
  const chars = [...text];
  if (index > chars.length) return text;
  chars.splice(index - 1, 1);
  return chars.join('');
};

// Delete — 커서 자리 글자를 지우고 뒤쪽을 왼쪽으로 당긴다.
export const deleteAt = (text: string, index: number): string => {
  const chars = [...text];
  if (index < 0 || index >= chars.length) return text;
  chars.splice(index, 1);
  return chars.join('');
};

// ── 구간 선택 ──────────────────────────────────────────────
//
// 선택은 **한 행 안에서만** 잡는다. 편집이 행 단위로 블록 본문에 되돌아가고
// (`blockTextWithRowEdit`), 행마다 속한 블록·논리 줄이 다를 수 있어 여러 행을 한 번에
// 고치면 앞 행을 고친 결과를 읽기도 전에 다음 행을 고치게 된다. 32칸 한 줄 안에서
// 고르고 복사·잘라내기·붙여넣기하는 것이 판면 편집의 실제 쓰임이기도 하다.

/** [from, to) 구간의 글자. 줄 끝을 넘는 칸은 없는 것으로 본다. */
export const sliceCells = (text: string, from: number, to: number): string =>
  [...text].slice(Math.max(0, from), Math.max(0, to)).join('');

/** [from, to) 구간을 지우고 그 자리에 input을 넣는다(선택 바꿔치기·잘라내기 공용). */
export const replaceRange = (
  text: string,
  from: number,
  to: number,
  input = '',
): string => {
  const chars = [...text];
  const start = Math.max(0, from);
  // 커서가 줄 끝보다 뒤면 사이를 공백으로 메운다(insertAt과 같은 규칙).
  while (chars.length < start) chars.push(' ');
  const end = Math.max(start, Math.min(to, chars.length));
  chars.splice(start, end - start, ...[...input]);
  return chars.join('');
};

// 점자 판면에 붙여넣을 수 있는 글자 — 점형(U+2800~U+283F)과 공백뿐이다.
// 묵자를 그대로 받으면 점자 줄에 한글이 섞여 조판이 어긋난다.
const BRAILLE_CELL = /[\u2800-\u283f]/;

export const isBrailleCell = (ch: string): boolean => BRAILLE_CELL.test(ch);

/** 붙여넣기 감리 — 점자 판면이면 점형·공백·개행만 남긴다. */
export const sanitizePaste = (
  text: string,
  isBraille: boolean,
): string => {
  if (!isBraille) return text;
  return [...text]
    .filter((ch) => isBrailleCell(ch) || ch === ' ' || ch === '\n' || ch === '\u3000')
    .join('');
};
