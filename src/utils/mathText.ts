// 묵자 초안(모드 a) 본문에 섞여 오는 LaTeX 수식을 알아본다.
//
// AI가 내는 초안은 수식을 $…$ · $$…$$ · \(…\) · \[…\] 로 감싸 온다. 이 표기는
// 본문 그대로 점역·다운로드로 넘어가므로 화면에서 지우거나 바꾸면 안 된다 —
// 사람 눈으로 확인할 수 있게 "미리보기"로만 따로 그린다.

const MATH_PATTERN =
  /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/;

export const hasMath = (text: string | null | undefined): boolean =>
  !!text && MATH_PATTERN.test(text);
