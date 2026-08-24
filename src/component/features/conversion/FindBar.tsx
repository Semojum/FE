import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react';
import DotInput from './DotInput';

// 문서 안에서 찾기·바꾸기 (Ctrl+F) — 브라우저 찾기와 같은 관습으로 둔다.
//  · Enter 다음 · Shift+Enter 이전 · Esc 닫기
//  · 범위: 원본만 / 결과만 / 전체
//  · 바꾸기는 **결과(출력)에만** 걸린다 — 원본 패널은 읽기 전용 미리보기라
//    고칠 대상이 아니다. 그래서 범위가 '원본만'이면 바꾸기를 잠근다.
//  · "점자로 입력": 로컬에 묵자→점자 번역기가 없어(조판 라이브러리는 번역을 하지 않는다)
//    점형을 직접 찍는다(DotInput). 방식은 판면 격자와 같다 — F D S · J K L 을 함께
//    누르고 떼면 한 글자가 커서 자리에 들어간다. 찾을 말·바꿀 말 양쪽에 적용된다.

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
  // 바꾸기 — 결과(출력)에만 걸린다.
  replacement: string;
  onReplacementChange: (value: string) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
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
  replacement,
  onReplacementChange,
  onReplace,
  onReplaceAll,
}) => {
  const [showReplace, setShowReplace] = useState(false);
  // 원본은 읽기 전용이라 바꿀 수 없다 — 범위가 '원본만'이면 잠근다.
  const canReplace = scope !== 'original' && total > 0;

  return (
    <div
      role="search"
      aria-label="문서에서 찾기"
      className="flex flex-col gap-1.5 rounded-[10px] border border-[#dfe8f2] bg-white px-2.5 py-1.5 shadow-[0_4px_16px_0_rgba(23,43,77,0.12)]"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={showReplace ? '바꾸기 접기' : '바꾸기 펼치기'}
          aria-expanded={showReplace}
          onClick={() => setShowReplace((v) => !v)}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          {showReplace ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <DotInput
          value={query}
          onChange={onQueryChange}
          brailleInput={brailleInput}
          label={brailleInput ? '찾을 점자' : '찾을 말'}
          placeholder="문서에서 찾기"
          className="w-[168px]"
          autoFocus
          focusToken={focusToken}
          onEnter={(shift) => onStep(shift ? -1 : 1)}
          onEscape={onClose}
        />

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
          title="점자를 직접 찍어 찾습니다 — 판면과 같은 방식(F D S · J K L 함께 누르고 떼기)"
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

      {showReplace && (
        <div className="flex items-center gap-2 border-t border-[#eef2f7] pl-[26px] pt-1.5">
          <DotInput
            value={replacement}
            onChange={onReplacementChange}
            brailleInput={brailleInput}
            label={brailleInput ? '바꿀 점자' : '바꿀 말'}
            placeholder="바꿀 말"
            className="w-[168px]"
            onEnter={() => canReplace && onReplace()}
            onEscape={onClose}
          />
          <button
            type="button"
            disabled={!canReplace}
            onClick={onReplace}
            className="rounded-[6px] border border-[#e2e8f0] px-2.5 py-1 text-[11px] font-bold text-gray-700 transition-colors hover:border-[#5b8ce6]/50 hover:text-[#5b8ce6] disabled:opacity-40"
          >
            바꾸기
          </button>
          <button
            type="button"
            disabled={!canReplace}
            onClick={onReplaceAll}
            className="rounded-[6px] bg-[#f47726] px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:brightness-95 disabled:opacity-40"
          >
            모두 바꾸기
          </button>
          <span className="text-[10.5px] text-gray-400">
            {scope === 'original'
              ? '원본은 바꿀 수 없습니다 — 범위를 결과로 바꿔 주세요'
              : '결과(출력)만 바뀝니다'}
          </span>
        </div>
      )}
    </div>
  );
};

export default FindBar;
