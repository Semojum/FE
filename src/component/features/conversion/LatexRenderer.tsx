// component/features/conversion/LatexRenderer.tsx
import { memo, useMemo } from 'react';
import katex from 'katex';
// ✅ [중요] KaTeX CSS가 없으면 수식이 렌더링되어도 예쁘게 나오지 않거나 깨집니다.
// 아직 추가하지 않으셨다면 반드시 아래 줄을 포함해 주세요!
import 'katex/dist/katex.min.css';

const LatexRenderer = memo(
  ({ text, className = '' }: { text: string; className?: string }) => {
    const renderedContent = useMemo(() => {
      if (!text) return null;

      // ✅ 수정된 정규식: $$, $, \[, \( 모두 잡아냅니다.
      const regex =
        /(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
      const parts = text.split(regex);

      return parts.map((part, index) => {
        // 1. 블록 수식 ($$ ... $$ 또는 \[ ... \])
        if (
          (part.startsWith('$$') && part.endsWith('$$')) ||
          (part.startsWith('\\[') && part.endsWith('\\]'))
        ) {
          const formula = part.slice(2, -2);
          try {
            const html = katex.renderToString(formula, {
              displayMode: true,
              throwOnError: false,
            });
            return (
              <div
                key={index}
                dangerouslySetInnerHTML={{ __html: html }}
                className="my-2"
              />
            );
          } catch (e) {
            return (
              <span key={index} className="text-red-500">
                {part}
              </span>
            );
          }
        }
        // 2. 인라인 수식 ($ ... $ 또는 \( ... \))
        else if (
          (part.startsWith('$') && part.endsWith('$')) ||
          (part.startsWith('\\(') && part.endsWith('\\)'))
        ) {
          // 기호 길이에 따라 자르는 개수 다르게 설정 ($는 1글자, \(는 2글자)
          const sliceLength = part.startsWith('$') ? 1 : 2;
          const formula = part.slice(sliceLength, -sliceLength);

          try {
            const html = katex.renderToString(formula, {
              displayMode: false,
              throwOnError: false,
            });
            return (
              <span key={index} dangerouslySetInnerHTML={{ __html: html }} />
            );
          } catch (e) {
            return (
              <span key={index} className="text-red-500">
                {part}
              </span>
            );
          }
        }

        // 3. 수식이 아닌 일반 텍스트
        return <span key={index}>{part}</span>;
      });
    }, [text]);

    return <div className={`break-words ${className}`}>{renderedContent}</div>;
  },
);

export default LatexRenderer;
