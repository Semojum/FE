import { describe, it, expect } from 'vitest';
import { buildTagMask } from '../conversion/BrailleGrid';
import type { LayoutRow } from '../../../utils/brailleLayout';

// 표식 마스크는 이제 **보이는 면만** 만든다. 그래서 지켜야 할 성질은 하나다 —
// 어떤 창으로 잘라 계산해도 문서 전체로 계산한 것의 그 구간과 **똑같아야** 한다.
// 표식이 줄·면 경계에서 잘리는 경우가 여기서 다 걸린다.

const COLS = 8;

const body = (blockId: string, text: string): LayoutRow[] => {
  const cs = [...text];
  const out: LayoutRow[] = [];
  for (let i = 0; i < cs.length; i += COLS) {
    out.push({
      kind: 'body',
      text: cs.slice(i, i + COLS).join(''),
      source: { pageNo: 1, blockId, lineIndex: 0, offset: i },
    });
  }
  return out;
};
const fixed = (): LayoutRow => ({ kind: 'fixed', text: '-'.repeat(COLS) });
const pad = (): LayoutRow => ({ kind: 'pad', text: '' });

const dim = (mask: boolean[][]) => mask.map((r) => r.map((b) => (b ? '#' : '.')).join(''));

describe('표식 마스크 — 창 단위 계산', () => {
  const doc: LayoutRow[] = [
    ...body('b1', 'AAAA<!주1>BBBBBBBBBBBB'), // 한 줄 안 + 줄 경계 걸침
    fixed(),
    ...body('b2', 'CC<!아주긴점역자주라서줄을넘는다>DD'),
    ...body('b3', 'EEEE<!닫히지않음EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'),
    pad(),
    ...body('b4', 'FF<!끝'),
    ...body('b5', '>GG'), // 블록이 다르면 이어지지 않는다
    ...body('b6', 'HHHH<!주2>HHHH'),
  ];

  const full = buildTagMask(doc, 0, doc.length, COLS);

  it('어떤 창으로 잘라도 전체 계산의 그 구간과 같다', () => {
    for (let a = 0; a <= doc.length; a += 1) {
      for (let b = a; b <= doc.length; b += 1) {
        expect(dim(buildTagMask(doc, a, b, COLS))).toEqual(dim(full.slice(a, b)));
      }
    }
  });

  it('한 면(2줄)씩 이어 붙이면 전체와 같다 — 실제 렌더 경로', () => {
    const pieces: boolean[][] = [];
    for (let a = 0; a < doc.length; a += 2) {
      pieces.push(...buildTagMask(doc, a, Math.min(a + 2, doc.length), COLS));
    }
    expect(dim(pieces)).toEqual(dim(full));
  });

  it('표식이 줄을 넘어가도 이어서 잡힌다', () => {
    // b2: 'CC<!…>DD' — 여는 <가 첫 줄, 닫는 >가 몇 줄 뒤다.
    const marked = full.flat().filter(Boolean).length;
    expect(marked).toBeGreaterThan(COLS); // 한 줄을 넘겼다
  });

  it('닫히지 않은 표식은 칠하지 않는다', () => {
    // b3은 '>'가 없다 — 그 블록 줄은 전부 비어 있어야 한다.
    const b3 = doc
      .map((r, i) => (r.source?.blockId === 'b3' ? i : -1))
      .filter((i) => i >= 0);
    for (const i of b3) expect(full[i].some(Boolean)).toBe(false);
  });

  it('블록이 바뀌면 표식이 이어지지 않는다', () => {
    const b4 = doc.findIndex((r) => r.source?.blockId === 'b4');
    const b5 = doc.findIndex((r) => r.source?.blockId === 'b5');
    expect(full[b4].some(Boolean)).toBe(false);
    expect(full[b5].some(Boolean)).toBe(false);
  });

  it('본문이 아닌 줄(변경선·여백)은 칠하지 않고 건너뛴다', () => {
    doc.forEach((r, i) => {
      if (r.kind !== 'body') expect(full[i].some(Boolean)).toBe(false);
    });
  });

  it('실제로 표식을 칠하기는 한다', () => {
    const first = doc.findIndex((r) => r.text.includes('<'));
    expect(full[first].some(Boolean)).toBe(true);
  });

  it('빈 창은 빈 결과 — 아직 크기를 못 잰 첫 렌더에서 터지면 안 된다', () => {
    expect(buildTagMask(doc, 0, 0, COLS)).toEqual([]);
    expect(buildTagMask([], 0, 0, COLS)).toEqual([]);
  });
});
