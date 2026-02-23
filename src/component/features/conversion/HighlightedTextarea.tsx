import React, { useRef, useCallback, memo, forwardRef } from 'react';
import TextareaAutosize, {
  TextareaAutosizeProps,
} from 'react-textarea-autosize';

interface HighlightedTextareaProps extends TextareaAutosizeProps {
  value: string;
  renderHighlight: (text: string) => React.ReactNode;
}

// 💡 forwardRef 제네릭 타입: <Ref로 참조할 엘리먼트 타입, Props 타입>
const HighlightedTextarea = memo(
  forwardRef<HTMLTextAreaElement, HighlightedTextareaProps>(
    (
      { value, renderHighlight, className = '', onChange, onScroll, ...props },
      ref, // 💡 부모로부터 전달받은 ref
    ) => {
      const backdropRef = useRef<HTMLDivElement>(null);

      const handleScroll = useCallback(
        (e: React.UIEvent<HTMLTextAreaElement>) => {
          if (backdropRef.current) {
            backdropRef.current.scrollTop = e.currentTarget.scrollTop;
            backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
          if (onScroll) onScroll(e);
        },
        [onScroll],
      );

      const sharedStyles = `w-full text-left whitespace-pre-wrap break-words font-mono leading-relaxed p-2 outline-none border border-transparent rounded-lg ${className}`;

      return (
        <div className="relative w-full h-full">
          {/* Backdrop (하이라이트된 텍스트 렌더링) */}
          <div
            ref={backdropRef}
            aria-hidden="true"
            className={`absolute inset-0 z-0 overflow-hidden pointer-events-none text-gray-800 ${sharedStyles}`}
          >
            {renderHighlight(value)}
          </div>

          {/* 실제 입력이 일어나는 Textarea */}
          <TextareaAutosize
            ref={ref} // ✅ 전달받은 ref를 실제 TextareaAutosize에 연결!
            value={value}
            onChange={onChange}
            onScroll={handleScroll}
            spellCheck={false}
            className={`relative z-10 bg-transparent resize-none text-transparent caret-black focus:ring-2 focus:ring-[#5A8FBB]/20 focus:shadow-sm transition-shadow ${sharedStyles}`}
            {...props}
          />
        </div>
      );
    },
  ),
);

// 디버깅을 위해 displayName 명시
HighlightedTextarea.displayName = 'HighlightedTextarea';

export default HighlightedTextarea;
