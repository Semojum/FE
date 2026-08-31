import { describe, it, expect } from 'vitest';
import {
  deleteAt,
  deleteBefore,
  insertAt,
  previewRows,
  replaceRange,
  sanitizePaste,
  sliceCells,
  toCells,
} from '../brailleGrid';

// 판면 배치는 brailleLayout(= braille-assist)이 맡는다. 여기는 한 행 안의 셀 편집만 본다.

describe('toCells', () => {
  it('한 글자를 한 칸에 넣고 남는 칸은 비운다', () => {
    expect(toCells('ab', 4)).toEqual(['a', 'b', '', '']);
  });

  it('32칸을 넘는 부분은 잘라 보여준다', () => {
    expect(toCells('abcde', 3)).toEqual(['a', 'b', 'c']);
  });
});

describe('insertAt — 격자 편집은 밀어쓰기다', () => {
  it('커서 칸에 끼워 넣고 뒤쪽을 오른쪽으로 민다', () => {
    expect(insertAt('abcde', 1, 'XY')).toBe('aXYbcde');
  });

  it('줄 끝보다 뒤에 쓰면 사이를 공백으로 메운다', () => {
    expect(insertAt('ab', 4, 'Z')).toBe('ab  Z');
  });

  it('맨 앞·맨 뒤에도 넣을 수 있다', () => {
    expect(insertAt('abc', 0, 'Z')).toBe('Zabc');
    expect(insertAt('abc', 3, 'Z')).toBe('abcZ');
  });
});

describe('deleteBefore / deleteAt — 지우면 뒤쪽이 왼쪽으로 당겨진다', () => {
  it('Backspace는 커서 앞 글자를 지운다', () => {
    expect(deleteBefore('abcd', 2)).toBe('acd');
  });

  it('줄 맨 앞에서 Backspace는 아무것도 하지 않는다', () => {
    expect(deleteBefore('abcd', 0)).toBe('abcd');
  });

  it('Delete는 커서 자리 글자를 지운다', () => {
    expect(deleteAt('abcd', 1)).toBe('acd');
  });

  it('범위 밖이면 그대로 둔다', () => {
    expect(deleteAt('abc', 9)).toBe('abc');
  });
});

// 대체 텍스트 피커의 점자 미리보기 — 판면과 같은 규칙으로 접되 앞 몇 줄만 쓴다.
describe('previewRows', () => {
  it('칸 수를 넘기면 다음 줄로 접는다', () => {
    expect(previewRows('abcdef', 4, 3)).toEqual(['abc', 'def']);
  });

  it('\n은 무조건 개행이다', () => {
    expect(previewRows('ab\ncd', 4, 8)).toEqual(['ab', 'cd']);
  });

  it('앞에서 요청한 줄 수까지만 돌려준다', () => {
    expect(previewRows('a\nb\nc\nd\ne', 3, 8)).toEqual(['a', 'b', 'c']);
  });

  it('빈 줄도 한 줄을 차지한다', () => {
    expect(previewRows('a\n\nb', 4, 8)).toEqual(['a', '', 'b']);
  });
});

// 1차 PoC(2026-08-26 · 필요성 최상) — 드래그·우클릭·Ctrl+C/X/V로 판면을 편집한다.
describe('구간 선택 편집', () => {
  describe('sliceCells', () => {
    it('고른 구간의 글자만 가져온다', () => {
      expect(sliceCells('가나다라마', 1, 3)).toBe('나다');
    });

    it('줄 끝을 넘겨도 있는 데까지만 준다', () => {
      expect(sliceCells('가나', 1, 10)).toBe('나');
    });

    it('빈 구간은 빈 문자열', () => {
      expect(sliceCells('가나다', 2, 2)).toBe('');
    });
  });

  describe('replaceRange', () => {
    it('고른 구간을 지운다 (잘라내기)', () => {
      expect(replaceRange('가나다라', 1, 3)).toBe('가라');
    });

    it('고른 구간을 다른 글자로 갈아치운다', () => {
      expect(replaceRange('가나다라', 1, 3, 'XY')).toBe('가XY라');
    });

    it('커서가 줄 끝보다 뒤면 사이를 공백으로 메운다 (insertAt과 같은 규칙)', () => {
      expect(replaceRange('가', 3, 3, 'X')).toBe('가  X');
    });

    it('구간이 줄 끝을 넘어가도 있는 데까지만 지운다', () => {
      expect(replaceRange('가나다', 1, 99, 'X')).toBe('가X');
    });

    it('점자 셀도 한 글자 한 칸으로 센다', () => {
      expect(replaceRange('⠁⠃⠉⠙', 1, 3, '⠭')).toBe('⠁⠭⠙');
    });
  });

  describe('sanitizePaste', () => {
    it('묵자 판면에는 그대로 붙여넣는다', () => {
      expect(sanitizePaste('가나다 abc', false)).toBe('가나다 abc');
    });

    it('점자 판면에서는 점형·공백·개행만 남긴다', () => {
      expect(sanitizePaste('⠁⠃가나 ⠉', true)).toBe('⠁⠃ ⠉');
    });

    it('점자 판면에 묵자만 붙여넣으면 남는 것이 없다', () => {
      expect(sanitizePaste('가나다', true)).toBe('');
    });

    it('여러 줄은 개행을 지킨다 — 블록 본문이 논리 줄로 나뉜다', () => {
      expect(sanitizePaste('⠁\n⠃', true)).toBe('⠁\n⠃');
    });
  });
});
