import { LayoutRow } from './brailleLayout';
import { findMath } from './mathText';

// 판면 격자 위에 수식을 표시하기 위한 계산.
//
// 기능정의서 "결과 렌더링" D-2(2026-07-27 결정):
//   수식이 등장하면 해당 구간에 밑줄을 치고, 그 아래에 LaTeX로 렌더링한 수식을
//   함께 제공한다.
// 격자는 한 논리 줄을 32칸씩 접어 여러 행으로 그리므로, 수식 구간이 행 경계를
// 넘어가는 일이 흔하다. 그래서 논리 줄 단위로 수식을 찾은 뒤 행·칸으로 되돌린다.

export interface MathAnnotation {
  // 밑줄 칠 칸 — rowIndex → 칸 번호 집합
  underline: Map<number, Set<number>>;
  // 렌더해 보여 줄 수식 — 그 논리 줄의 마지막 행 아래에 붙인다
  formulasAfterRow: Map<number, string[]>;
}

const EMPTY: MathAnnotation = {
  underline: new Map(),
  formulasAfterRow: new Map(),
};

// 한 블록(blockId)에 속한 행들을 논리 줄별로 묶는다.
// 수식은 여러 논리 줄에 걸치기도 한다(```로 감싼 독립 수식이 그렇다). 그래서 논리
// 줄 하나씩 보지 않고 블록 본문을 통째로 이어 붙여 찾은 뒤 행·칸으로 되돌린다.
interface BlockRows {
  // lineIndex 오름차순, 각 줄은 offset 오름차순 행 목록
  lines: { lineIndex: number; rowIndices: number[] }[];
}

const groupBlocks = (rows: LayoutRow[]): BlockRows[] => {
  const blocks = new Map<string, Map<number, number[]>>();
  rows.forEach((row, index) => {
    const src = row.source;
    if (!src || row.kind !== 'body') return;
    const key = `${src.pageNo}:${src.blockId}`;
    const lines = blocks.get(key) ?? new Map<number, number[]>();
    const list = lines.get(src.lineIndex) ?? [];
    list.push(index);
    lines.set(src.lineIndex, list);
    blocks.set(key, lines);
  });

  return [...blocks.values()].map((lines) => ({
    lines: [...lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([lineIndex, rowIndices]) => ({ lineIndex, rowIndices })),
  }));
};

export const annotateMath = (rows: LayoutRow[]): MathAnnotation => {
  const blocks = groupBlocks(rows);
  if (blocks.length === 0) return EMPTY;

  const underline = new Map<number, Set<number>>();
  const formulasAfterRow = new Map<number, string[]>();

  for (const block of blocks) {
    // 행 → 논리 줄 → 블록 본문 순으로 되살린다(행은 그 줄의 32칸 조각이다).
    const lines = block.lines.map(({ rowIndices }) => {
      const ordered = [...rowIndices].sort(
        (a, b) => (rows[a].source?.offset ?? 0) - (rows[b].source?.offset ?? 0),
      );
      return { ordered, text: ordered.map((i) => rows[i].text).join('') };
    });
    const blockText = lines.map((l) => l.text).join('\n');
    const matches = findMath(blockText);
    if (matches.length === 0) continue;

    // 각 논리 줄이 블록 본문에서 시작하는 위치(줄바꿈 한 글자를 포함해 센다).
    const lineStarts: number[] = [];
    let at = 0;
    for (const line of lines) {
      lineStarts.push(at);
      at += [...line.text].length + 1;
    }

    for (const m of matches) {
      let lastTouchedRow = -1;
      lines.forEach((line, i) => {
        const lineStart = lineStarts[i];
        const lineEnd = lineStart + [...line.text].length;
        const from = Math.max(m.start, lineStart);
        const to = Math.min(m.end, lineEnd);
        if (to <= from) return;
        lastTouchedRow = line.ordered[line.ordered.length - 1];
        // 밑줄은 사람이 본 그대로(감싼 기호 포함) 친다. 다만 ```만 있는 줄은
        // 표기 기호일 뿐이라 밑줄을 치면 판면만 어지럽다.
        if (line.text.trim() === '```') return;
        markRange(
          underline,
          rows,
          line.ordered,
          from - lineStart,
          to - lineStart,
        );
      });
      if (lastTouchedRow < 0) continue;
      const list = formulasAfterRow.get(lastTouchedRow) ?? [];
      list.push(m.body);
      formulasAfterRow.set(lastTouchedRow, list);
    }
  }

  return { underline, formulasAfterRow };
};

// 논리 줄 [start, end) 구간을 행·칸으로 옮겨 밑줄 표시한다.
const markRange = (
  underline: Map<number, Set<number>>,
  rows: LayoutRow[],
  ordered: number[],
  start: number,
  end: number,
): void => {
  for (const rowIndex of ordered) {
    const offset = rows[rowIndex].source?.offset ?? 0;
    const length = [...rows[rowIndex].text].length;
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + length);
    if (to <= from) continue;
    const cells = underline.get(rowIndex) ?? new Set<number>();
    for (let c = from - offset; c < to - offset; c++) cells.add(c);
    underline.set(rowIndex, cells);
  }
};
