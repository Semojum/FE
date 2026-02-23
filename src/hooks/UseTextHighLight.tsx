import { useMemo } from 'react';

/**
 * <!내용> 패턴을 찾아 텍스트를 흐리게(Dim) 처리하는 훅
 * @param text 원본 텍스트
 * @returns ReactNode 배열 (렌더링 가능한 형태)
 */
export const useTextHighlight = (text: string) => {
  return useMemo(() => {
    if (!text) return <>{text}</>;

    // 💡 정규식: <! 로 시작하고 > 로 끝나는 가장 짧은 문자열(비탐욕적 매칭 *?)을 캡처
    // 캡처 그룹 '()'을 사용하면 split 결과 배열에 매칭된 문자열이 그대로 포함됩니다.
    const regex = /(<!.*?>)/g;
    const parts = text.split(regex);

    return parts.map((part, index) => {
      // 분리된 텍스트 중 <! 로 시작하고 > 로 끝나는 파트인지 확인
      if (part.startsWith('<!') && part.endsWith('>')) {
        return (
          <span
            key={`dim-${index}`}
            // 💡 "흐리게" 처리하는 Tailwind 클래스
            // opacity-40 (투명도), text-gray-400 (회색), select-none (드래그 방지)
            // 만약 물리적인 블러 효과를 원하시면 'blur-[1px]' 또는 'blur-sm'을 추가하세요.
            className="text-gray-400 opacity-50 select-none transition-opacity"
          >
            {part}
          </span>
        );
      }

      // 패턴에 해당하지 않는 일반 텍스트
      return <span key={`text-${index}`}>{part}</span>;
    });
  }, [text]);
};
