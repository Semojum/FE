import { memo, useMemo } from 'react';
import katex from 'katex';

const LatexRenderer = memo(
  ({ text, className = '' }: { text: string; className?: string }) => {
    const renderedContent = useMemo(() => {
      if (!text) return null;

      // 정규식: $$...$$ 또는 $...$ 또는 일반 텍스트 분리
      // 괄호 ()를 사용하여 구분자도 결과 배열에 포함시킴
      const regex = /(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$)/g;
      const parts = text.split(regex);

      return parts.map((part, index) => {
        // 블록 수식 ($$ ... $$)
        if (part.startsWith('$$') && part.endsWith('$$')) {
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
        // 인라인 수식 ($ ... $)
        else if (part.startsWith('$') && part.endsWith('$')) {
          const formula = part.slice(1, -1);
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
        // 일반 텍스트
        return <span key={index}>{part}</span>;
      });
    }, [text]);

    return <div className={`break-words ${className}`}>{renderedContent}</div>;
  },
);

export default memo(LatexRenderer);