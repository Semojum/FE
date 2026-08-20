import { describe, expect, it } from 'vitest';
import { hasMath, splitMath } from '../mathText';

// 찾는 규칙과 그리는 규칙이 어긋나면 "수식이 있는데 미리보기가 안 뜨는" 블록이 생긴다.
// 두 쓰임이 같은 splitMath를 보므로, 여기서 표기별로 한 번씩 확인한다.

describe('splitMath', () => {
  it('네 가지 표기와 환경을 모두 잡는다', () => {
    expect(splitMath('앞 $x^2$ 뒤')).toEqual([
      { kind: 'text', body: '앞 ' },
      { kind: 'inline', body: 'x^2' },
      { kind: 'text', body: ' 뒤' },
    ]);
    expect(splitMath('$$\\frac{a}{b}$$')).toEqual([
      { kind: 'block', body: '\\frac{a}{b}' },
    ]);
    expect(splitMath('\\(x\\)')).toEqual([{ kind: 'inline', body: 'x' }]);
    expect(splitMath('\\[y\\]')).toEqual([{ kind: 'block', body: 'y' }]);
    expect(splitMath('\\begin{align}a &= b\\\\c &= d\\end{align}')).toEqual([
      { kind: 'block', body: '\\begin{align}a &= b\\\\c &= d\\end{align}' },
    ]);
  });

  // OCR 초안은 수식이 줄을 넘어 오는 일이 잦다. 예전에는 판별 정규식만 줄바꿈을
  // 막아 놔서, 렌더는 되는데 미리보기 칸이 아예 안 뜨는 블록이 있었다.
  it('줄을 넘는 인라인 수식도 같은 규칙으로 본다', () => {
    const text = '값은 $a +\nb$ 이다';
    expect(hasMath(text)).toBe(true);
    expect(splitMath(text)[1]).toEqual({ kind: 'inline', body: 'a +\nb' });
  });

  it('$$가 $보다 먼저다', () => {
    expect(splitMath('$$a$$')[0].kind).toBe('block');
  });
});

describe('hasMath', () => {
  it('수식이 없으면 false — 미리보기 칸을 띄우지 않는다', () => {
    expect(hasMath('1. 다음 물음에 답하시오.')).toBe(false);
    expect(hasMath('가격은 1,000$ 입니다')).toBe(false); // 짝이 없는 $
    expect(hasMath('')).toBe(false);
    expect(hasMath(null)).toBe(false);
  });
});
