import { describe, expect, it } from 'vitest';
import {
  cellToDots,
  dotsToCell,
  isBrailleText,
  isDotKey,
  toggleDot,
} from '../brailleInput';

// 찾기 창의 "점자로 입력" — 로컬에 묵자→점자 번역기가 없어 점형을 직접 찍는다.
// F D S = 1·2·3점, J K L = 4·5·6점 (점자 타자기 배열).

describe('6점 입력', () => {
  it('키를 점 번호로 읽는다', () => {
    expect(isDotKey('f')).toBe(true);
    expect(isDotKey('L')).toBe(true);
    expect(isDotKey('a')).toBe(false);
  });

  it('같은 키를 다시 누르면 그 점을 지운다', () => {
    let dots = toggleDot(new Set(), 'f');
    expect([...dots]).toEqual([1]);
    dots = toggleDot(dots, 'f');
    expect([...dots]).toEqual([]);
  });

  it('찍은 점을 한 칸으로 만든다', () => {
    // 1·2·4점 = ⠋ (U+280B)
    expect(dotsToCell(new Set([1, 2, 4]))).toBe('⠋');
    // 아무 점도 없으면 빈 칸
    expect(dotsToCell(new Set())).toBe('⠀');
    // 여섯 점 모두 = ⠿
    expect(dotsToCell(new Set([1, 2, 3, 4, 5, 6]))).toBe('⠿');
  });

  it('칸에서 점 번호를 되읽는다 (붙여넣은 점자 이어 고치기)', () => {
    expect([...cellToDots('⠋')].sort()).toEqual([1, 2, 4]);
    expect([...cellToDots('가')]).toEqual([]);
  });

  it('점자 문자인지 가린다', () => {
    expect(isBrailleText('⠈⠪')).toBe(true);
    expect(isBrailleText('굴절률')).toBe(false);
    expect(isBrailleText('')).toBe(false);
  });
});
