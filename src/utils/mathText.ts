// 묵자 초안(모드 a) 본문에 섞여 오는 LaTeX 수식을 찾아 조각으로 가른다.
//
// AI가 내는 초안은 수식을 $…$ · $$…$$ · \(…\) · \[…\] 로 감싸고, 여러 줄짜리는
// \begin{align}…\end{align} 같은 환경으로 낸다. 여기에 더해 **독립된 수식 요소
// (type=formula · render_mode=formula_block)는 $ 없이 ``` 코드펜스로 온다**
// (2026-08-20 실서버 실측):
//     ```
//     b_{k+i} = \frac{1}{a_{i}} - 1 \quad (i = 1, 2, 3)
//     ```
// 글 안에 섞인 $…$는 렌더되는데 이 펜스 블록만 안 그려져서, 사용자에게는
// "어떤 수식은 뜨고 어떤 수식은 안 뜬다"로 보였다. 이 표기는 본문 그대로 점역·다운로드로
// 넘어가므로 화면에서 지우거나 바꾸면 안 된다 — 사람 눈으로 확인할 수 있게
// "미리보기"로만 따로 그린다.
//
// ⚠️ 찾는 규칙과 그리는 규칙은 반드시 같아야 한다. 예전에는 미리보기를 띄울지
// 판단하는 정규식과 실제로 조각내는 정규식이 서로 달라(줄바꿈 허용 여부), 수식이
// 있는데도 칸이 안 뜨는 블록이 생겼다(2026-08-20 QA).

export type MathSegment =
  | { kind: 'text'; body: string }
  | { kind: 'inline'; body: string }
  | { kind: 'block'; body: string };

// 순서가 중요하다 — $$…$$를 $…$보다 먼저 봐야 한다.
const MATH_PATTERN = new RegExp(
  [
    '\\$\\$[\\s\\S]+?\\$\\$', // $$ … $$
    '\\\\\\[[\\s\\S]+?\\\\\\]', // \[ … \]
    '\\\\begin\\{[a-zA-Z*]+\\}[\\s\\S]+?\\\\end\\{[a-zA-Z*]+\\}', // \begin{align} … \end{align}
    '```(?:[a-zA-Z]+)?\\n?[\\s\\S]+?```', // ``` … ``` (독립 수식 요소)
    '\\$[^$]+?\\$', // $ … $  (줄바꿈도 허용 — OCR 초안은 수식이 줄을 넘는다)
    '\\\\\\([\\s\\S]+?\\\\\\)', // \( … \)
  ].join('|'),
  'g',
);

// 여러 줄로 크게 그릴 표기($$ · \[ · 환경 · 펜스)와 글줄 안에 넣을 표기($ · \()를 가른다.
const isBlockMath = (raw: string): boolean =>
  raw.startsWith('$$') ||
  raw.startsWith('\\[') ||
  raw.startsWith('\\begin{') ||
  raw.startsWith('```');

// 펜스 안이 정말 수식인지 — LaTeX 명령이나 위·아래 첨자가 하나도 없으면 그냥 글이다
// (코드 조각을 수식으로 그려 버리면 더 이상하다).
const LOOKS_LIKE_LATEX = /\\[a-zA-Z]+|[_^]\{|[_^][0-9a-zA-Z]|[=<>]/;

// 감싼 기호를 벗겨 KaTeX에 넘길 알맹이만 남긴다.
const unwrap = (raw: string): string => {
  if (raw.startsWith('```')) {
    return raw
      .slice(3, -3)
      .replace(/^[a-zA-Z]*\n?/, '') // ```latex 같은 언어 표시를 걷어낸다
      .trim();
  }
  if (raw.startsWith('$$')) return raw.slice(2, -2);
  if (raw.startsWith('\\[') || raw.startsWith('\\(')) return raw.slice(2, -2);
  if (raw.startsWith('$')) return raw.slice(1, -1);
  return raw; // \begin{…}\end{…}는 통째로 넘긴다
};

export const splitMath = (text: string): MathSegment[] => {
  const segments: MathSegment[] = [];
  let last = 0;
  // 전역 정규식은 lastIndex를 들고 다니므로 호출마다 새로 만든다.
  const re = new RegExp(MATH_PATTERN.source, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) {
      segments.push({ kind: 'text', body: text.slice(last, m.index) });
    }
    const body = unwrap(m[0]);
    // 수식으로 보이지 않는 펜스는 본문 그대로 둔다.
    if (m[0].startsWith('```') && !LOOKS_LIKE_LATEX.test(body)) {
      segments.push({ kind: 'text', body: m[0] });
    } else {
      segments.push({ kind: isBlockMath(m[0]) ? 'block' : 'inline', body });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: 'text', body: text.slice(last) });
  }
  return segments;
};

export const hasMath = (text: string | null | undefined): boolean =>
  !!text && splitMath(text).some((s) => s.kind !== 'text');
