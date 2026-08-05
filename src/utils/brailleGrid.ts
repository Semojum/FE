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

// 격자 편집은 "덮어쓰기"다 — 커서 칸부터 글자를 갈아 끼우고, 줄 길이는 늘어나되
// 앞쪽 칸이 밀리지 않는다.
export const overwriteAt = (
  text: string,
  index: number,
  input: string,
): string => {
  const chars = [...text];
  // 커서가 줄 끝보다 뒤면 사이를 공백으로 메운다.
  while (chars.length < index) chars.push(' ');
  const inputChars = [...input];
  inputChars.forEach((ch, i) => {
    chars[index + i] = ch;
  });
  return chars.join('');
};

// 한 칸을 비운다(Delete / Backspace). 뒤쪽이 비게 되면 오른쪽 공백은 정리한다.
export const clearCellAt = (text: string, index: number): string => {
  const chars = [...text];
  if (index < 0 || index >= chars.length) return text;
  chars[index] = ' ';
  return chars.join('').replace(/\s+$/, '');
};
