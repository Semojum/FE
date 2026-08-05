import { TranslationBlock } from '../types';

// 결과 패널의 격자 모델 (Figma V3-03 에디터).
//
// 결과는 원본 파일 페이지 단위로 끊지 않는다. 모든 블록의 줄을 순서대로 이어 붙인 뒤,
// 점자 판면 규격(기본 26줄 × 32칸)으로 잘라 "출력 쪽"을 만들고 세로로 계속 스크롤한다.
// 하단 페이지네이션이 옮기는 것은 원본 파일 페이지이지 이 출력 쪽이 아니다.

export const CELLS_PER_ROW = 32;
export const ROWS_PER_PAGE = 26;

// 쪽번호를 넣으면 마지막 줄이 쪽번호 자리로 빠져 본문은 한 줄 줄어든다
// (점역 설정 F-03: 입력한 줄 수는 꼬리말을 포함한 전체 줄 수로 본다).
export const bodyRowsPerPage = (insertPageNumber: boolean): number =>
  insertPageNumber ? ROWS_PER_PAGE - 1 : ROWS_PER_PAGE;

// 격자의 한 줄. 저장은 여전히 원본 페이지 단위(PUT .../pages/{pageNo}/elements)이므로
// 어느 페이지의 어느 블록 몇 번째 줄인지를 그대로 들고 있는다.
export interface GridLine {
  pageNo: number;
  blockId: string;
  lineIndex: number;
  text: string;
  // 사람 확인이 필요한 블록 — 색을 달리해 표시한다 (대체 초안 D-3)
  isBlocked?: boolean;
  // 대체 초안이 있는 블록 — 우클릭 메뉴에서 후보 보기를 연다
  hasDrafts?: boolean;
}

// 페이지 순서 → 블록 순서 → 블록 안 줄 순서로 평평하게 편다.
export const buildGridLines = (
  blocksByPage: Record<number, TranslationBlock[]>,
): GridLine[] => {
  const pages = Object.keys(blocksByPage)
    .map(Number)
    .sort((a, b) => a - b);

  const lines: GridLine[] = [];
  for (const pageNo of pages) {
    for (const block of blocksByPage[pageNo] ?? []) {
      // 빈 블록도 한 줄을 차지한다(빈 줄로 보여야 편집할 수 있다).
      const blockLines = block.currentText.split('\n');
      blockLines.forEach((text, lineIndex) => {
        lines.push({
          pageNo,
          blockId: block.id,
          lineIndex,
          text,
          isBlocked: block.isBlocked,
          hasDrafts: (block.drafts?.length ?? 0) > 0,
        });
      });
    }
  }
  return lines;
};

// 줄 배열에서 특정 블록의 전체 텍스트를 다시 만든다(한 줄을 고친 뒤 블록에 되돌릴 때).
export const blockTextFromLines = (
  lines: GridLine[],
  blockId: string,
): string =>
  lines
    .filter((l) => l.blockId === blockId)
    .map((l) => l.text)
    .join('\n');

// 원본 파일 페이지의 첫 줄이 격자에서 몇 번째인지 — 페이지를 넘겼을 때 그 지점으로
// 스크롤해 원본과 결과의 대조를 유지한다.
export const firstLineIndexOfPage = (
  lines: GridLine[],
  pageNo: number,
): number => {
  const idx = lines.findIndex((l) => l.pageNo === pageNo);
  return idx === -1 ? 0 : idx;
};

// 총 출력 쪽 수. 줄이 하나도 없어도 1쪽으로 본다(빈 판면을 그린다).
export const totalOutputPages = (
  lineCount: number,
  insertPageNumber: boolean,
): number =>
  Math.max(1, Math.ceil(lineCount / bodyRowsPerPage(insertPageNumber)));

// 한 글자를 한 칸에 넣는다. 32칸을 넘는 부분은 잘라 보여주고(저장값은 건드리지 않는다),
// 모자라면 빈 칸으로 채운다.
export const toCells = (text: string, cells = CELLS_PER_ROW): string[] => {
  const chars = [...text].slice(0, cells);
  return [...chars, ...Array(Math.max(0, cells - chars.length)).fill('')];
};

// 격자 편집은 "밀어쓰기"다 — 커서 칸에 글자를 끼워 넣고 뒤쪽 글자는 오른쪽으로 밀린다.
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

// 밀어쓰기라 한 줄이 32칸을 넘을 수 있다. 넘친 글자 수 — 0이면 넘치지 않은 것.
// (실제 줄바꿈은 조판이 할 일이므로 FE는 값을 자르지 않고 넘쳤다는 사실만 알린다.)
export const overflowCount = (text: string, cells = CELLS_PER_ROW): number =>
  Math.max(0, [...text].length - cells);
