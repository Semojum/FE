import { describe, expect, it } from 'vitest';
import { findRanges, searchGrid, searchTextBlocks } from '../docSearch';
import { LayoutRow } from '../brailleLayout';

const body = (text: string, offset: number, lineIndex = 0): LayoutRow => ({
  kind: 'body',
  text,
  source: { pageNo: 1, blockId: 'b1', lineIndex, offset },
});

describe('findRanges', () => {
  it('겹치지 않는 모든 자리를 찾는다', () => {
    expect(findRanges('가나가나가', '가나')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('대소문자를 가리지 않는다', () => {
    expect(findRanges('Braille BRF', 'brf')).toEqual([{ start: 8, end: 11 }]);
  });

  it('빈 검색어는 아무것도 찾지 않는다', () => {
    expect(findRanges('아무 글', '')).toEqual([]);
  });
});

describe('searchGrid', () => {
  it('행 경계를 넘는 말도 찾아 행·칸으로 되돌린다', () => {
    // 논리 줄 '앞 굴절률 뒤'가 두 행으로 접힌 경우(앞 행이 4글자라 다음 행 offset=4)
    const rows = [body('앞 굴절', 0), body('률 뒤', 4)];
    const [match] = searchGrid(rows, '굴절률');

    expect(match.rowIndex).toBe(0);
    expect(match.cells).toEqual([
      { rowIndex: 0, cells: [2, 3] },
      { rowIndex: 1, cells: [0] },
    ]);
  });

  it('점자 셀도 그대로 찾는다 (점자로 찾기)', () => {
    const rows = [body('⠈⠪⠐⠕⠋', 0)];
    const [match] = searchGrid(rows, '⠐⠕');
    expect(match.cells).toEqual([{ rowIndex: 0, cells: [2, 3] }]);
  });

  it('없으면 빈 목록', () => {
    expect(searchGrid([body('앞 뒤', 0)], '굴절률')).toEqual([]);
  });
});

describe('searchTextBlocks', () => {
  it('블록별로 걸린 구간을 돌려준다', () => {
    const blocks = [
      { id: 'a', content: '굴절률과 속도' },
      { id: 'b', content: '굴절률' },
    ];
    expect(searchTextBlocks(blocks, '굴절률')).toEqual([
      { blockId: 'a', range: { start: 0, end: 3 } },
      { blockId: 'b', range: { start: 0, end: 3 } },
    ]);
  });
});
