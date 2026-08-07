import { describe, it, expect } from 'vitest';
import { deleteAt, deleteBefore, insertAt, toCells } from '../brailleGrid';

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
