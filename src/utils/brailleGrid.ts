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
