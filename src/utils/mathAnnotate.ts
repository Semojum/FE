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

// 같은 논리 줄(blockId + lineIndex)에 속한 행들을 순서대로 묶는다.
const groupLines = (rows: LayoutRow[]): number[][] => {
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const src = row.source;
    if (!src || row.kind !== 'body') return;
    const key = `${src.pageNo}:${src.blockId}:${src.lineIndex}`;
    const list = groups.get(key);
    if (list) list.push(index);
    else groups.set(key, [index]);
  });
  return [...groups.values()];
};

export const annotateMath = (rows: LayoutRow[]): MathAnnotation => {
  const groups = groupLines(rows);
  if (groups.length === 0) return EMPTY;

  const underline = new Map<number, Set<number>>();
  const formulasAfterRow = new Map<number, string[]>();

  for (const indices of groups) {
    // 행들을 이어 붙여 논리 줄을 되살린다(행은 그 줄의 32칸 조각이다).
    const ordered = [...indices].sort(
      (a, b) => (rows[a].source?.offset ?? 0) - (rows[b].source?.offset ?? 0),
    );
    const line = ordered.map((i) => rows[i].text).join('');
    const matches = findMath(line);
    if (matches.length === 0) continue;

    const lastRow = ordered[ordered.length - 1];
    for (const m of matches) {
      // 밑줄은 사람이 본 그대로(감싼 기호 포함) 친다.
      markRange(underline, rows, ordered, m.start, m.end);
      const list = formulasAfterRow.get(lastRow) ?? [];
      list.push(m.body);
      formulasAfterRow.set(lastRow, list);
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
