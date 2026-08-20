import { describe, expect, it } from 'vitest';
import { hasMath } from '../mathText';

describe('hasMath', () => {
  it('네 가지 수식 표기를 모두 알아본다', () => {
    expect(hasMath('다음 극한값은 $\\lim_{x \\to 0} x$ 이다')).toBe(true);
    expect(hasMath('$$\\frac{a}{b}$$')).toBe(true);
    expect(hasMath('\\(x^2\\) 을 구하시오')).toBe(true);
    expect(hasMath('\\[\\int_0^1 f(x)dx\\]')).toBe(true);
  });

  it('수식이 없으면 false — 미리보기 칸을 띄우지 않는다', () => {
    expect(hasMath('1. 다음 물음에 답하시오.')).toBe(false);
    expect(hasMath('가격은 1,000$ 입니다')).toBe(false); // 짝이 없는 $
    expect(hasMath('')).toBe(false);
    expect(hasMath(null)).toBe(false);
  });
});
