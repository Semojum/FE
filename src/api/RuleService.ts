import { apiRequest } from './apiClient';

// 점자 규정 검색 — GET /api/rules (V3 명세 2026-09-01 신설).
//
// 전체 239건(문화체육관광부 184 · 국립장애인도서관 42 · 국립특수교육원 13).
// 검색어 없이 부르면 원문 순서 그대로 와서 목차처럼 훑을 수 있다.
//
// 응답의 section은 페이지 조회 응답 rule_trail.section과 같은 " · " 합본 형식이라,
// 에디터 규정 배지에서 본 문자열이 검색 결과에도 그대로 보인다. 배지의 ruleId를
// 그대로 넣으면 그 규정 하나만 나온다(명세).

export type RulePublisher = 'MCST' | 'NLD' | 'NISE';

export interface Rule {
  ruleId: string;
  publisherCode: RulePublisher;
  publisher: string;
  source: string;
  version: number | null;
  /** 조문 경로 한 줄 — "한글 점자 · 제2장… · 제6절… · 제13항" */
  section: string;
  ruleName: string;
  contents: string;
  tag: string | null;
  /** 어디에 걸려서 나왔는지 — ruleId / ruleName / section / contents */
  matchedIn: string | null;
}

export interface RuleSearchResult {
  items: Rule[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface RuleQuery {
  q?: string;
  publisher?: RulePublisher | null;
  page?: number;
  size?: number;
}

const EMPTY: RuleSearchResult = {
  items: [],
  page: 0,
  size: 0,
  totalElements: 0,
  totalPages: 0,
};

/**
 * 규정을 찾는다. 검색어는 공백으로 나눈 여러 단어가 모두 걸려야 한다(AND).
 *
 * 못 불러오면 빈 결과를 돌린다 — 규정 검색이 실패해도 편집 화면은 그대로 써야 한다.
 * 실패와 "결과 없음"을 호출부가 가려야 하면 그때 형태를 나눈다.
 */
export const searchRules = async (
  { q, publisher, page = 0, size = 20 }: RuleQuery,
  token?: string | null,
  signal?: AbortSignal,
): Promise<RuleSearchResult> => {
  const params = new URLSearchParams();
  const query = q?.trim();
  // 명세상 1~100자 — 넘기면 COMMON4000이라 보내기 전에 자른다.
  if (query) params.set('q', query.slice(0, 100));
  if (publisher) params.set('publisher', publisher);
  params.set('page', String(page));
  params.set('size', String(size));

  try {
    return await apiRequest<RuleSearchResult>(`/api/rules?${params}`, {
      token,
      signal,
    });
  } catch {
    return EMPTY;
  }
};
