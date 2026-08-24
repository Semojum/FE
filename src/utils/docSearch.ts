import { LayoutRow } from './brailleLayout';
import { groupBlockLines, rangeToRows } from './rowRanges';

// 열려 있는 작업 안에서 찾기(Ctrl+F).
//
// 인덱스를 두지 않는다 — 에디터는 작업 하나만 메모리에 들고 있고, 500쪽짜리도
// 본문이 1MB 남짓이라 훑는 데 1ms가 안 걸린다. 인덱스를 만들고 편집마다 갱신하는
// 비용이 찾는 비용보다 크다.

export interface TextRange {
  start: number;
  end: number;
}

// 판면에서 걸린 한 건 — 화면에 칠할 자리(행·칸)와 이동할 행을 함께 들고 있다.
export interface GridMatch {
  cells: { rowIndex: number; cells: number[] }[];
  // 이동·스크롤 기준 행 (구간이 시작하는 행)
  rowIndex: number;
}

// 원본 텍스트에서 걸린 한 건.
export interface TextMatch {
  blockId: string;
  range: TextRange;
}

// 대소문자를 가리지 않는다. 한글에는 영향이 없고, 영어 원문에서만 편해진다.
export const findRanges = (text: string, query: string): TextRange[] => {
  if (!query) return [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const found: TextRange[] = [];
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    found.push({ start: at, end: at + needle.length });
    // 겹치는 자리도 각각 세지 않는다 — 브라우저 찾기와 같은 규칙.
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
};

// 결과 판면(격자)에서 찾는다. 행 순서대로 돌려준다.
export const searchGrid = (rows: LayoutRow[], query: string): GridMatch[] => {
  if (!query.trim()) return [];
  const matches: GridMatch[] = [];
  for (const block of groupBlockLines(rows)) {
    for (const range of findRanges(block.text, query)) {
      const { byRow } = rangeToRows(rows, block, range.start, range.end);
      if (byRow.length === 0) continue;
      matches.push({ cells: byRow, rowIndex: byRow[0].rowIndex });
    }
  }
  return matches.sort((a, b) => a.rowIndex - b.rowIndex);
};

// 좌측 원본(묵자 텍스트)에서 찾는다.
export const searchTextBlocks = (
  blocks: { id: string; content: string }[],
  query: string,
): TextMatch[] => {
  if (!query.trim()) return [];
  return blocks.flatMap((block) =>
    findRanges(block.content, query).map((range) => ({
      blockId: block.id,
      range,
    })),
  );
};
