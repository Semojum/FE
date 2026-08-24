import React, { useEffect, useRef, useState } from 'react';
import {
  cellToDots,
  dotsToCell,
  isDotKey,
  toggleDot,
} from '../../../utils/brailleInput';

// 찾기·바꾸기 입력칸. "점자로 입력"을 켜면 6점 입력으로 바뀐다.
//
// 로컬에는 묵자→점자 번역기가 없다(조판 라이브러리는 번역을 하지 않는다). 그래서
// 점자를 찾거나 점자로 바꾸려면 점형을 직접 찍어야 한다 — 점역사 표준 배열을 쓴다.
//   F D S = 1·2·3점 · J K L = 4·5·6점 · 스페이스 한 칸 확정 · 백스페이스 되돌리기

interface Props {
  value: string;
  onChange: (value: string) => void;
  brailleInput: boolean;
  label: string;
  placeholder: string;
  className?: string;
  autoFocus?: boolean;
  // 다시 포커스를 달라는 신호(값이 바뀔 때마다 입력칸으로 돌아온다).
  focusToken?: number;
  onEnter?: (shiftKey: boolean) => void;
  onEscape?: () => void;
}

const DotInput: React.FC<Props> = ({
  value,
  onChange,
  brailleInput,
  label,
  placeholder,
  className = '',
  autoFocus = false,
  focusToken,
  onEnter,
  onEscape,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // 값은 로컬이 먼저 받는다 — 결과 전용 창에서는 이 값이 메인 창을 한 번 돌아
  // 돌아오므로(스냅샷), 그 왕복을 기다리면 빠르게 칠 때 글자가 흘린다.
  // 밖에서 바뀐 값(다른 창의 조작·닫기)은 그대로 받아들인다.
  const [draft, setDraft] = useState(value);
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(value);
    }
  }, [value]);

  const emit = (next: string) => {
    emitted.current = next;
    setDraft(next);
    onChange(next);
  };
  // 점역 타자는 여섯 손가락을 화음처럼 거의 동시에 누른다. 상태만 쓰면 같은 틱에
  // 들어온 키들이 렌더 전의 옛 값을 보고 서로를 덮어써, 확정할 때 점이 비어 버린다.
  // 그래서 값은 ref가 들고, 상태는 화면 표시용으로만 따라간다.
  const dotsRef = useRef<Set<number>>(new Set());
  const [pendingDots, setPendingDots] = useState<Set<number>>(new Set());
  // 한글 조합 중에는 Enter를 넘기지 않는다(조합 확정과 겹친다).
  const composing = useRef(false);

  const setDots = (next: Set<number>) => {
    dotsRef.current = next;
    setPendingDots(next);
  };

  useEffect(() => {
    if (!autoFocus && focusToken === undefined) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [autoFocus, focusToken]);

  // 입력 방식을 바꾸면 찍다 만 점은 버린다.
  useEffect(() => setDots(new Set()), [brailleInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape?.();
      return;
    }
    if (e.key === 'Enter' && !composing.current) {
      e.preventDefault();
      onEnter?.(e.shiftKey);
      return;
    }
    if (!brailleInput) return;

    if (isDotKey(e.key)) {
      e.preventDefault();
      setDots(toggleDot(dotsRef.current, e.key));
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      // 찍어 둔 점이 없으면 빈 칸(⠀)을 넣는다 — 점자에서 칸 띄우기는 글자다.
      emit(draft + dotsToCell(dotsRef.current));
      setDots(new Set());
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (dotsRef.current.size > 0) {
        setDots(new Set());
        return;
      }
      const cells = [...draft];
      // 마지막 칸을 지우되, 점을 찍다 만 것처럼 이어서 고칠 수 있게 되살린다.
      const last = cells.pop();
      emit(cells.join(''));
      if (last) setDots(cellToDots(last));
      return;
    }
    // 그 밖의 글자는 점자 모드에서 무시한다(붙여넣기는 onChange가 받는다).
    if (e.key.length === 1) e.preventDefault();
  };

  return (
    <span className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={draft}
        aria-label={label}
        placeholder={brailleInput ? 'F D S · J K L 로 점 찍기' : placeholder}
        onChange={(e) => emit(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        className={`h-[26px] rounded-[6px] border border-[#e2e8f0] px-2 text-[12px] text-gray-700 outline-none focus:border-[#5b8ce6] ${className}`}
      />
      {/* 찍고 있는 점 — 아직 확정 전이라 옅게 보여 준다 */}
      {brailleInput && (
        <span
          aria-live="polite"
          aria-label={
            pendingDots.size > 0
              ? `찍은 점 ${[...pendingDots].sort().join('·')}`
              : '찍은 점 없음'
          }
          className="w-[16px] text-center text-[15px] text-gray-400"
        >
          {pendingDots.size > 0 ? dotsToCell(pendingDots) : '·'}
        </span>
      )}
    </span>
  );
};

export default DotInput;
