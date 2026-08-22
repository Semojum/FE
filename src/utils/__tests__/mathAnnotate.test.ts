import { describe, expect, it } from 'vitest';
import { annotateMath } from '../mathAnnotate';
import { LayoutRow } from '../brailleLayout';

// 기능정의서 "결과 렌더링" D-2: 수식 구간에 밑줄을 치고 그 아래에 렌더한 수식을 붙인다.
// 격자는 논리 줄을 32칸씩 접으므로 수식이 행 경계를 넘는 경우가 잦다 — 이어 붙여 찾는다.

const body = (text: string, offset: number, lineIndex = 0): LayoutRow => ({
  kind: 'body',
  text,
  source: { pageNo: 1, blockId: 'b1', lineIndex, offset },
});

describe('annotateMath', () => {
  it('한 행 안의 수식에 밑줄을 치고 그 행 아래에 수식을 붙인다', () => {
    const rows = [body('값은 $x^2$ 이다', 0)];
    const { underline, formulasAfterRow } = annotateMath(rows);

    // '$x^2$' 는 3~7번 칸
    expect([...(underline.get(0) ?? [])]).toEqual([3, 4, 5, 6, 7]);
    expect(formulasAfterRow.get(0)).toEqual(['x^2']);
  });

  it('행 경계를 넘는 수식도 이어 붙여 찾는다', () => {
    // 논리 줄 '앞 $a+b$ 끝' 이 두 행으로 접힌 경우
    const rows = [body('앞 $a+', 0), body('b$ 끝', 5)];
    const { underline, formulasAfterRow } = annotateMath(rows);

    expect([...(underline.get(0) ?? [])]).toEqual([2, 3, 4]);
    expect([...(underline.get(1) ?? [])]).toEqual([0, 1]);
    // 렌더는 그 줄의 마지막 행 아래에 한 번만.
    expect(formulasAfterRow.get(1)).toEqual(['a+b']);
    expect(formulasAfterRow.has(0)).toBe(false);
  });

  // 독립 수식 요소는 ``` 펜스로 오고, 펜스는 여는 줄·본문·닫는 줄 3개의 논리 줄에
  // 걸쳐 있다. 논리 줄 하나씩만 보면 짝이 맞지 않아 통째로 놓친다(2026-08-22 확인).
  it('여러 논리 줄에 걸친 ``` 펜스 수식도 찾는다', () => {
    const rows = [
      body('```', 0, 0),
      body('b_{k+i} = \\frac{1}{a_{i}} - 1', 0, 1),
      body('```', 0, 2),
    ];
    const { underline, formulasAfterRow } = annotateMath(rows);

    // 밑줄은 본문 줄에만 — ```만 있는 줄은 표기 기호라 긋지 않는다.
    expect(underline.has(0)).toBe(false);
    expect(underline.get(1)?.size).toBe(29); // 본문 줄 전체
    expect(underline.has(2)).toBe(false);
    // 렌더는 구간이 끝나는 줄 아래에 한 번.
    expect(formulasAfterRow.get(2)).toEqual(['b_{k+i} = \\frac{1}{a_{i}} - 1']);
    expect(formulasAfterRow.has(0)).toBe(false);
  });

  it('수식이 없으면 아무것도 표시하지 않는다', () => {
    const { underline, formulasAfterRow } = annotateMath([
      body('1. 다음 물음에 답하시오.', 0),
    ]);
    expect(underline.size).toBe(0);
    expect(formulasAfterRow.size).toBe(0);
  });

  it('본문이 아닌 행(페이지행·빈 행)은 건드리지 않는다', () => {
    const rows: LayoutRow[] = [
      { kind: 'fixed', text: '$a$' },
      { kind: 'pad', text: '' },
    ];
    expect(annotateMath(rows).underline.size).toBe(0);
  });
});
