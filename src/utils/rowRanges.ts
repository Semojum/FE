import { LayoutRow } from './brailleLayout';

// 판면 격자의 "논리 텍스트 ↔ 행·칸" 변환.
//
// 격자는 블록 본문을 논리 줄로 자르고 그 줄을 다시 32칸씩 접어 행으로 그린다.
// 그래서 무엇을 찾든(수식·검색어) 화면 행을 그대로 훑으면 경계에 걸린 것을 놓친다.
// 블록 본문을 통째로 이어 붙여 찾은 뒤, 그 구간을 다시 행·칸으로 되돌려야 한다.

export interface BlockLines {
  // lineIndex 오름차순. 각 줄은 offset 오름차순 행 목록과 그 줄의 본문.
  lines: { rowIndices: number[]; text: string }[];
  // 블록 본문(논리 줄을 \n으로 이은 것)
  text: string;
  // 각 논리 줄이 블록 본문에서 시작하는 위치
  lineStarts: number[];
}

export const groupBlockLines = (rows: LayoutRow[]): BlockLines[] => {
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

  return [...blocks.values()].map((lineMap) => {
    const lines = [...lineMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, rowIndices]) => {
        const ordered = [...rowIndices].sort(
          (a, b) =>
            (rows[a].source?.offset ?? 0) - (rows[b].source?.offset ?? 0),
        );
        return {
          rowIndices: ordered,
          text: ordered.map((i) => rows[i].text).join(''),
        };
      });

    const lineStarts: number[] = [];
    let at = 0;
    for (const line of lines) {
      lineStarts.push(at);
      at += [...line.text].length + 1; // 줄바꿈 한 글자를 포함해 센다
    }
    return { lines, text: lines.map((l) => l.text).join('\n'), lineStarts };
  });
};

// 블록 본문의 [start, end) 구간을 행·칸으로 옮긴다.
// 돌려주는 값은 (행 번호 → 그 행에서 걸리는 칸 목록)과, 구간이 끝나는 행.
export const rangeToRows = (
  rows: LayoutRow[],
  block: BlockLines,
  start: number,
  end: number,
): { byRow: { rowIndex: number; cells: number[] }[]; lastRow: number } => {
  const byRow: { rowIndex: number; cells: number[] }[] = [];
  let lastRow = -1;

  block.lines.forEach((line, i) => {
    const lineStart = block.lineStarts[i];
    const lineEnd = lineStart + [...line.text].length;
    const from = Math.max(start, lineStart) - lineStart;
    const to = Math.min(end, lineEnd) - lineStart;
    if (to <= from) return;
    lastRow = line.rowIndices[line.rowIndices.length - 1];

    for (const rowIndex of line.rowIndices) {
      const offset = rows[rowIndex].source?.offset ?? 0;
      const length = [...rows[rowIndex].text].length;
      const cellFrom = Math.max(from, offset) - offset;
      const cellTo = Math.min(to, offset + length) - offset;
      if (cellTo <= cellFrom) continue;
      const cells: number[] = [];
      for (let c = cellFrom; c < cellTo; c++) cells.push(c);
      byRow.push({ rowIndex, cells });
    }
  });

  return { byRow, lastRow };
};
