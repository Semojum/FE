import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TYPESET,
  footerCellBudget,
  footerOverflowHint,
  minFooterCells,
} from '../typesetOptions';

const withFooter = (footerText: string) => ({ ...DEFAULT_TYPESET, footerText });

describe('꼬리말 길이 경고', () => {
  // 32칸에서 양 끝 쪽번호가 각각 5칸 + 사이 두 칸씩을 가져간다.
  it('쓸 수 있는 자리는 쪽번호를 뺀 나머지다', () => {
    expect(footerCellBudget(DEFAULT_TYPESET)).toBe(18);
    expect(footerCellBudget({ ...DEFAULT_TYPESET, showOrigPage: false })).toBe(25);
  });

  // 2026-09-03 실측: 이 꼬리말은 점역하면 17칸이라 18칸 자리에 들어간다.
  // 예전 어림값(한글 3칸)은 24칸으로 보고 "잘릴 수 있습니다"를 띄웠다.
  it('들어가는 꼬리말에는 경고하지 않는다', () => {
    expect(footerOverflowHint(withFooter('수학 1-2. 다항함수'))).toBeNull();
  });

  it('글자 수가 이미 자리를 넘으면 확실히 잘리므로 경고한다', () => {
    const hint = footerOverflowHint(withFooter('가'.repeat(19)));
    expect(hint).toContain('뒤가 잘립니다');
  });

  it('딱 맞으면 경고하지 않는다', () => {
    expect(footerOverflowHint(withFooter('가'.repeat(18)))).toBeNull();
  });

  it('최소 칸 수는 글자 수다 — 앞뒤 공백은 세지 않는다', () => {
    expect(minFooterCells('  제3장 함수  ')).toBe(6);
  });
});
