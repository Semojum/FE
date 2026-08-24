import { LayoutRow } from './brailleLayout';
import { findMath } from './mathText';
import { groupBlockLines, rangeToRows } from './rowRanges';

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

export const annotateMath = (rows: LayoutRow[]): MathAnnotation => {
  const blocks = groupBlockLines(rows);
  if (blocks.length === 0) return EMPTY;

  const underline = new Map<number, Set<number>>();
  const formulasAfterRow = new Map<number, string[]>();

  for (const block of blocks) {
    for (const m of findMath(block.text)) {
      const { byRow, lastRow } = rangeToRows(rows, block, m.start, m.end);
      if (lastRow < 0) continue;
      for (const { rowIndex, cells } of byRow) {
        // ```만 있는 줄은 표기 기호일 뿐이라 밑줄을 치면 판면만 어지럽다.
        if (rows[rowIndex].text.trim() === '```') continue;
        const set = underline.get(rowIndex) ?? new Set<number>();
        cells.forEach((c) => set.add(c));
        underline.set(rowIndex, set);
      }
      const list = formulasAfterRow.get(lastRow) ?? [];
      list.push(m.body);
      formulasAfterRow.set(lastRow, list);
    }
  }

  return { underline, formulasAfterRow };
};
