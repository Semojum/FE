// 앱 안에서 점자 규정·제작 지침을 찾아보는 자료.
//
// 1차 PoC(2026-08-26) 부가 기능 요청: "앱 자체에서 점자 규정, 점자 자료 제작 지침
// 검색 가능한 페이지 구현 — 규정 검색하는 일이 빈번해 구현 시 유용함"(필요성 중).
//
// ⚠ **여기 실린 것은 조판 규칙 발췌뿐이다.** 전체 규정·제작 지침 원문은 서버가 들고
//   있고(시연에서 "규정 하나하나가 텍스트 파일"), 검색도 서버가 내주기로 한 항목이다
//   (docs/SERVER-REQUIREMENTS-3.3.0.md S-6). 이 파일은 그때까지 화면과 검색을 먼저
//   세워 두기 위한 것이고, 내용은 **레포가 이미 근거로 적어 둔 조항**(vendor/
//   braille-assist/README.md "조판 규칙과 근거")에서만 옮겼다 — 지어낸 규정은 없다.
//   서버가 열리면 `RULES`를 API 응답으로 갈아 끼우고 이 파일은 지운다.

export interface Rule {
  id: string;
  /** 사람이 찾을 이름 */
  title: string;
  /** 규칙 본문 — 한두 문장으로 실무에서 쓰는 형태 */
  body: string;
  /** 근거 조항 */
  cite: string;
  /** 검색에 쓰는 별칭(본문에 없는 말로도 찾게) */
  tags: string[];
}

export const RULES: Rule[] = [
  {
    id: 'page-row',
    title: '페이지행 구성',
    body: '면의 마지막 줄에 원본 쪽 번호 · 꼬리말 · 점자 면 번호를 순서대로 넣는다.',
    cite: '점자 도서 제작 지침 1장 2절 2',
    tags: ['페이지행', '쪽번호', '마지막 줄'],
  },
  {
    id: 'orig-page-pos',
    title: '원본 쪽 번호 위치',
    body: '페이지행 왼쪽 정렬, 첫 칸부터 적는다.',
    cite: '1장 2절 2-2(2)',
    tags: ['원본 쪽', '왼쪽', '정렬'],
  },
  {
    id: 'cont-alpha',
    title: '걸침 알파벳',
    body: '원본 한 쪽이 여러 면에 걸치면 두 번째 면부터 번호 앞에 로마자표 없이 a, b, c…를 붙인다. 순번은 점자 면 순번이지 페이지행 순번이 아니다.',
    cite: '1장 2절 2-2(3) · [예 1-7]',
    tags: ['걸침', '이어짐', '알파벳', 'a b c'],
  },
  {
    id: 'orig-page-of-row',
    title: '페이지행에 적는 원본 쪽 번호',
    body: '그 면의 첫 줄이 속한 원본 쪽 번호를 적는다.',
    cite: '1장 2절 2-2(4)',
    tags: ['원본 쪽', '첫 줄'],
  },
  {
    id: 'braille-page-pos',
    title: '점자 면 번호 위치',
    body: '페이지행 오른쪽 정렬.',
    cite: '1장 2절 2-3(1)',
    tags: ['점자 면', '오른쪽', '정렬'],
  },
  {
    id: 'page-row-on',
    title: '페이지행을 넣는 면',
    body: '홀수 면에 넣는 것이 지침이고 실물 관행이다. 전체 면에 넣는 곳도 있어 앱에서는 전체·홀수·없음 중에 고른다.',
    cite: '1장 2절 2-1 · 원장 C-11(점자 도서 82권 실측)',
    tags: ['홀수', '전체', '페이지행'],
  },
  {
    id: 'footer-align',
    title: '꼬리말 정렬과 사이 띄우기',
    body: '가운데 정렬하고, 양쪽 쪽 번호와 두 칸 이상 띄운다.',
    cite: '1장 3-1)',
    tags: ['꼬리말', '가운데', '두 칸', '띄어쓰기'],
  },
  {
    id: 'footer-overflow',
    title: '꼬리말이 길 때',
    body: '들어갈 칸 수만큼만 적는다(뒤는 자른다).',
    cite: '1장 3-4)',
    tags: ['꼬리말', '길이', '자르기'],
  },
  {
    id: 'page-size',
    title: '한 면의 규격',
    body: '32칸 26줄. 페이지행이 들어가는 면은 본문이 25줄이 된다.',
    cite: '1장 3',
    tags: ['32칸', '26줄', '규격'],
  },
  {
    id: 'wrap',
    title: '줄 바꿈',
    body: '32칸에서 그대로 자른다. 어절 단위로 넘기는 규칙은 없다.',
    cite: '조판 가이드 §1',
    tags: ['줄바꿈', '어절', '32칸'],
  },
  {
    id: 'change-line',
    title: '원본 쪽 변경선',
    body: '첫 칸부터 ⠤로 채우고 오른쪽 끝에 새 원본 쪽 번호를 적는다. 원본 쪽이 바뀌는 자리마다 넣되 첫 쪽 앞에는 두지 않는다.',
    cite: '2장 2절 2-3',
    tags: ['변경선', '구분선', '원본 쪽'],
  },
  {
    id: 'first-line-blank',
    title: '면 첫 줄의 빈 줄',
    body: '면의 첫 줄에 오는 빈 줄은 버린다.',
    cite: '지침 개정 3 — “점자 페이지 첫 줄 … 예외 최소화”',
    tags: ['빈 줄', '첫 줄'],
  },
  {
    id: 'cover',
    title: '표지 면의 페이지행',
    body: '표지로 잡은 범위의 쪽에는 페이지행을 넣지 않는다.',
    cite: '조판 옵션 §5',
    tags: ['표지', '속표지', '페이지행 생략'],
  },
  {
    id: 'brf-space',
    title: 'BRF 파일의 공백',
    body: '표준 Braille ASCII 64셀 표를 쓰고, 공백 셀(U+2800)은 리터럴 스페이스로 낸다.',
    cite: 'Braille ASCII 표준',
    tags: ['brf', '아스키', '공백'],
  },
];

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

/**
 * 제목·본문·근거·별칭을 훑어 찾는다. 띄어쓰기는 무시한다 —
 * "페이지 행"과 "페이지행"을 다르게 찾으면 규정 검색으로 쓸모가 없다.
 */
export const searchRules = (query: string): Rule[] => {
  const q = norm(query);
  if (!q) return RULES;
  return RULES.filter((r) =>
    norm([r.title, r.body, r.cite, ...r.tags].join(' ')).includes(q),
  );
};
