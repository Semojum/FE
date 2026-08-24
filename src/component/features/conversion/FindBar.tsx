import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  cellToDots,
  dotsToCell,
  isDotKey,
  toggleDot,
} from '../../../utils/brailleInput';

// 문서 안에서 찾기 (Ctrl+F) — 브라우저 찾기와 같은 관습으로 둔다.
//  · Enter 다음 · Shift+Enter 이전 · Esc 닫기
//  · 범위: 원본만 / 결과만 / 전체
//  · "점자로 입력": 로컬에 묵자→점자 번역기가 없어(조판 라이브러리는 번역을 하지 않는다)
//    점형을 직접 찍는다. F D S = 1·2·3점, J K L = 4·5·6점, 스페이스로 한 칸 확정.

export type FindScope = 'all' | 'original' | 'result';

const SCOPE_LABEL: Record<FindScope, string> = {
  all: '전체',
  original: '원본만',
  result: '결과만',
};

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  scope: FindScope;
  onScopeChange: (scope: FindScope) => void;
  brailleInput: boolean;
  onBrailleInputChange: (on: boolean) => void;
  total: number;
  current: number; // 0-based. total이 0이면 무시된다.
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
  // 열려 있는 상태에서 Ctrl+F를 다시 누르면 입력창으로 돌아온다(브라우저와 같은 습관).
  focusToken?: number;
}

const FindBar: React.FC<Props> = ({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  brailleInput,
  onBrailleInputChange,
  total,
  current,
  onStep,
  onClose,
  focusToken = 0,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // 아직 확정하지 않은 점들 — 스페이스를 누르면 한 칸으로 굳는다.
  // 점역 타자는 여섯 손가락을 화음처럼 거의 동시에 누른다. 상태만 쓰면 같은 틱에
  // 들어온 키들이 렌더 전의 옛 값을 보고 서로를 덮어써, 확정할 때 점이 비어 버린다.
  // 그래서 값은 ref가 들고, 상태는 화면 표시용으로만 따라간다.
  const dotsRef = useRef<Set<number>>(new Set());
  const [pendingDots, setPendingDots] = useState<Set<number>>(new Set());
  const setDots = (next: Set<number>) => {
    dotsRef.current = next;
    setPendingDots(next);
  };
  // 한글 입력 조합 중에는 찾지 않는다(자모가 낱개로 검색되는 것을 막는다).
  const composing = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  // 입력 방식을 바꾸면 찍다 만 점은 버린다.
  useEffect(() => {
    dotsRef.current = new Set();
    setPendingDots(new Set());
  }, [brailleInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter' && !composing.current) {
      e.preventDefault();
      onStep(e.shiftKey ? -1 : 1);
      return;
    }
    if (!brailleInput) return;

    // ── 점자 입력 모드 ─────────────────────────────────────────────
    if (isDotKey(e.key)) {
      e.preventDefault();
      setDots(toggleDot(dotsRef.current, e.key));
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      // 찍어 둔 점이 없으면 빈 칸(⠀)을 넣는다 — 점자에서 칸 띄우기는 글자다.
      onQueryChange(query + dotsToCell(dotsRef.current));
      setDots(new Set());
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (dotsRef.current.size > 0) {
        setDots(new Set());
        return;
      }
      const cells = [...query];
      // 마지막 칸을 지우되, 점을 찍다 만 것처럼 이어서 고칠 수 있게 되살린다.
      const last = cells.pop();
      onQueryChange(cells.join(''));
      if (last) setDots(cellToDots(last));
      return;
    }
    // 그 밖의 글자는 점자 모드에서 무시한다(붙여넣기는 onChange가 받는다).
    if (e.key.length === 1) e.preventDefault();
  };

  return (
    <div
      role="search"
      aria-label="문서에서 찾기"
      className="flex items-center gap-2 rounded-[10px] border border-[#dfe8f2] bg-white px-2.5 py-1.5 shadow-[0_4px_16px_0_rgba(23,43,77,0.12)]"
    >
      <input
        ref={inputRef}
        value={query}
        aria-label={brailleInput ? '찾을 점자' : '찾을 말'}
        placeholder={
          brailleInput ? 'F D S · J K L 로 점 찍기' : '문서에서 찾기'
        }
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        className="h-[26px] w-[168px] rounded-[6px] border border-[#e2e8f0] px-2 text-[12px] text-gray-700 outline-none focus:border-[#5b8ce6]"
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
          className="w-[22px] text-center text-[15px] text-gray-400"
        >
          {pendingDots.size > 0 ? dotsToCell(pendingDots) : '·'}
        </span>
      )}

      <span className="min-w-[46px] text-center text-[11.5px] text-gray-500">
        {query.trim() ? `${total === 0 ? 0 : current + 1}/${total}` : '0/0'}
      </span>

      <button
        type="button"
        aria-label="이전 찾기"
        disabled={total === 0}
        onClick={() => onStep(-1)}
        className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
      >
        <ChevronUp size={15} />
      </button>
      <button
        type="button"
        aria-label="다음 찾기"
        disabled={total === 0}
        onClick={() => onStep(1)}
        className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
      >
        <ChevronDown size={15} />
      </button>

      <div
        role="radiogroup"
        aria-label="찾을 범위"
        className="flex gap-0.5 rounded-[7px] bg-[#f0f4f8] p-[3px]"
      >
        {(Object.keys(SCOPE_LABEL) as FindScope[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={scope === s}
            onClick={() => onScopeChange(s)}
            className={`rounded-[5px] px-2 py-0.5 text-[11px] font-bold transition-colors ${
              scope === s
                ? 'bg-white text-[#5b8ce6]'
                : 'text-gray-500 hover:text-[#5b8ce6]'
            }`}
          >
            {SCOPE_LABEL[s]}
          </button>
        ))}
      </div>

      <label
        title="점자를 직접 찍어 찾습니다 (F D S · J K L, 스페이스로 한 칸 확정)"
        className="flex cursor-pointer items-center gap-1 text-[11px] font-bold text-gray-500"
      >
        <input
          type="checkbox"
          checked={brailleInput}
          onChange={(e) => onBrailleInputChange(e.target.checked)}
          className="size-3 accent-[#5b8ce6]"
        />
        점자로 입력
      </label>

      <button
        type="button"
        aria-label="찾기 닫기"
        onClick={onClose}
        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <X size={15} />
      </button>
    </div>
  );
};

export default FindBar;
