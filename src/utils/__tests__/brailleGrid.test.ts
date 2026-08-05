import { describe, it, expect } from 'vitest';
import {
  blockTextFromLines,
  bodyRowsPerPage,
  buildGridLines,
  clearCellAt,
  firstLineIndexOfPage,
  overwriteAt,
  toCells,
  totalOutputPages,
} from '../brailleGrid';
import { TranslationBlock } from '../../types';

const block = (id: string, text: string): TranslationBlock => ({
  id,
  currentText: text,
  candidates: [],
});

describe('buildGridLines', () => {
  it('페이지 → 블록 → 줄 순서로 이어 붙인다', () => {
    const lines = buildGridLines({
      2: [block('b3', '3페이지처럼 보이지만 2페이지')],
      1: [block('b1', '첫 줄\n둘째 줄'), block('b2', '셋째 줄')],
    });

    expect(lines.map((l) => l.text)).toEqual([
      '첫 줄',
      '둘째 줄',
      '셋째 줄',
      '3페이지처럼 보이지만 2페이지',
    ]);
    // 저장 단위를 알 수 있도록 원본 페이지와 블록을 그대로 들고 있다.
    expect(lines[1]).toMatchObject({ pageNo: 1, blockId: 'b1', lineIndex: 1 });
    expect(lines[3]).toMatchObject({ pageNo: 2, blockId: 'b3', lineIndex: 0 });
  });

  it('빈 블록도 한 줄을 차지한다', () => {
    expect(buildGridLines({ 1: [block('b1', '')] })).toHaveLength(1);
  });
});

describe('blockTextFromLines', () => {
  it('한 줄을 고친 뒤 블록 본문을 다시 만든다', () => {
    const lines = buildGridLines({ 1: [block('b1', 'a\nb\nc')] });
    const edited = lines.map((l, i) => (i === 1 ? { ...l, text: 'B' } : l));
    expect(blockTextFromLines(edited, 'b1')).toBe('a\nB\nc');
  });
});

describe('출력 쪽 계산', () => {
  it('쪽번호를 넣으면 본문이 한 줄 줄어든다', () => {
    expect(bodyRowsPerPage(false)).toBe(26);
    expect(bodyRowsPerPage(true)).toBe(25);
  });

  it('줄 수를 판면 규격으로 나눠 쪽 수를 구한다', () => {
    expect(totalOutputPages(26, false)).toBe(1);
    expect(totalOutputPages(27, false)).toBe(2);
    // 쪽번호를 넣으면 25줄마다 넘어간다
    expect(totalOutputPages(26, true)).toBe(2);
  });

  it('줄이 없어도 빈 판면 한 쪽은 그린다', () => {
    expect(totalOutputPages(0, false)).toBe(1);
  });
});

describe('firstLineIndexOfPage', () => {
  it('원본 페이지의 첫 줄 위치를 찾는다 (페이지 이동 시 스크롤 대상)', () => {
    const lines = buildGridLines({
      1: [block('b1', 'a\nb')],
      2: [block('b2', 'c')],
    });
    expect(firstLineIndexOfPage(lines, 2)).toBe(2);
  });

  it('없는 페이지는 맨 앞으로', () => {
    expect(firstLineIndexOfPage([], 5)).toBe(0);
  });
});

describe('toCells', () => {
  it('한 글자를 한 칸에 넣고 남는 칸은 비운다', () => {
    expect(toCells('ab', 4)).toEqual(['a', 'b', '', '']);
  });

  it('32칸을 넘는 부분은 잘라 보여준다', () => {
    expect(toCells('abcde', 3)).toEqual(['a', 'b', 'c']);
  });
});

describe('overwriteAt — 격자 편집은 덮어쓰기다', () => {
  it('커서 칸부터 갈아 끼우고 뒷글자를 밀지 않는다', () => {
    expect(overwriteAt('abcde', 1, 'XY')).toBe('aXYde');
  });

  it('줄 끝보다 뒤에 쓰면 사이를 공백으로 메운다', () => {
    expect(overwriteAt('ab', 4, 'Z')).toBe('ab  Z');
  });

  it('줄보다 긴 입력은 뒤로 늘어난다', () => {
    expect(overwriteAt('ab', 1, 'XYZ')).toBe('aXYZ');
  });
});

describe('clearCellAt', () => {
  it('한 칸을 비운다', () => {
    expect(clearCellAt('abc', 1)).toBe('a c');
  });

  it('끝 칸을 비우면 오른쪽 공백은 정리한다', () => {
    expect(clearCellAt('abc', 2)).toBe('ab');
  });

  it('범위 밖이면 그대로 둔다', () => {
    expect(clearCellAt('abc', 9)).toBe('abc');
  });
});
