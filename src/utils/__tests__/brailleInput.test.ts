import { describe, expect, it } from 'vitest';
import {
  BRAILLE_DOT_MAP,
  codesToCell,
  isBrailleText,
  isDotCode,
} from '../brailleInput';

// 판면 격자와 찾기·바꾸기 입력칸이 같은 규칙을 쓴다(입력 방법이 두 가지면 안 된다).

describe('6점 입력', () => {
  it('키는 자판 배열과 무관하게 e.code로 본다', () => {
    expect(isDotCode('KeyF')).toBe(true);
    expect(isDotCode('KeyL')).toBe(true);
    expect(isDotCode('KeyG')).toBe(false);
    // 1~6점이 각각 비트 하나씩
    expect(Object.values(BRAILLE_DOT_MAP)).toEqual([1, 2, 4, 8, 16, 32]);
  });

  it('함께 누른 키들을 점형 한 글자로 합친다', () => {
    // 1·2·4점 = ⠋
    expect(codesToCell(['KeyF', 'KeyD', 'KeyJ'])).toBe('⠋');
    // 여섯 점 모두 = ⠿
    expect(codesToCell(['KeyF', 'KeyD', 'KeyS', 'KeyJ', 'KeyK', 'KeyL'])).toBe(
      '⠿',
    );
    // 아무 점도 없으면 빈 칸
    expect(codesToCell([])).toBe('⠀');
    // 모르는 키는 무시한다
    expect(codesToCell(['KeyF', 'KeyG'])).toBe('⠁');
  });

  it('점자 문자인지 가린다', () => {
    expect(isBrailleText('⠈⠪')).toBe(true);
    expect(isBrailleText('굴절률')).toBe(false);
    expect(isBrailleText('')).toBe(false);
  });
});
