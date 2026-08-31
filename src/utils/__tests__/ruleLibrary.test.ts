import { describe, it, expect } from 'vitest';
import { RULES, searchRules } from '../ruleLibrary';

describe('점자 규정 찾아보기', () => {
  it('빈 검색어는 전부 보여 준다', () => {
    expect(searchRules('')).toHaveLength(RULES.length);
    expect(searchRules('   ')).toHaveLength(RULES.length);
  });

  it('본문에 있는 말로 찾는다', () => {
    const found = searchRules('꼬리말');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((r) => /꼬리말/.test(r.title + r.body + r.tags.join('')))).toBe(
      true,
    );
  });

  it('띄어쓰기를 무시한다 — "페이지 행"으로도 페이지행을 찾는다', () => {
    expect(searchRules('페이지 행').map((r) => r.id)).toEqual(
      searchRules('페이지행').map((r) => r.id),
    );
    expect(searchRules('페이지 행').length).toBeGreaterThan(0);
  });

  it('근거 조항으로도 찾는다', () => {
    expect(searchRules('1장 3-4').map((r) => r.id)).toContain('footer-overflow');
  });

  it('별칭으로도 찾는다 — 본문에 없는 말', () => {
    expect(searchRules('구분선').map((r) => r.id)).toContain('change-line');
  });

  it('없는 말은 빈 결과', () => {
    expect(searchRules('존재하지않는규정')).toHaveLength(0);
  });

  it('모든 항목에 근거가 달려 있다 — 지어낸 규정을 두지 않는다', () => {
    expect(RULES.every((r) => r.cite.trim().length > 0)).toBe(true);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });
});
