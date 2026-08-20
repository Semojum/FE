import { memo, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { splitMath } from '../../../utils/mathText';

// LaTeX 표기가 섞인 본문을 사람이 읽는 모양으로 그린다(모드 a 수식 미리보기).
// 조각내는 규칙은 utils/mathText 하나만 쓴다 — 미리보기를 띄울지 판단하는 곳과
// 같은 규칙이어야 "수식이 있는데 안 뜨는" 블록이 생기지 않는다.

// KaTeX 옵션
//  · throwOnError: false — 모르는 명령이 있어도 그 자리만 붉게 남기고 나머지는 그린다.
//  · strict: 'ignore'    — 수식 안의 한글을 오류로 보지 않는다. OCR 초안은 "$속도 =
//    \frac{거리}{시간}$"처럼 한글이 수식 안에 그대로 들어오는데, 기본(strict) 설정에서는
//    이 한 글자 때문에 수식 전체가 붉은 원문으로 떨어져 "수식이 안 뜬다"로 보였다.
const OPTIONS = { throwOnError: false, strict: 'ignore' as const };

const render = (formula: string, displayMode: boolean): string => {
  try {
    return katex.renderToString(formula, { ...OPTIONS, displayMode });
  } catch {
    // renderToString이 그래도 던지면(치명적 파싱 오류) 원문을 그대로 보여 준다.
    return '';
  }
};

const LatexRenderer = memo(
  ({ text, className = '' }: { text: string; className?: string }) => {
    const parts = useMemo(() => splitMath(text ?? ''), [text]);

    return (
      <div className={`break-words ${className}`}>
        {parts.map((part, index) => {
          if (part.kind === 'text') return <span key={index}>{part.body}</span>;

          const html = render(part.body, part.kind === 'block');
          if (!html) {
            // 그리지 못한 수식은 원문 그대로 — 아무것도 안 보이는 것보다 낫다.
            return (
              <span key={index} className="text-[#ef4444]">
                {part.body}
              </span>
            );
          }
          return part.kind === 'block' ? (
            <div
              key={index}
              className="my-2"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <span key={index} dangerouslySetInnerHTML={{ __html: html }} />
          );
        })}
      </div>
    );
  },
);

export default LatexRenderer;
