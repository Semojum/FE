import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react';
import DotInput from './DotInput';
import { ConversionTab, TABS } from '../../../types';

// 문서 안에서 찾기·바꾸기 (Ctrl+F) — 브라우저 찾기와 같은 관습으로 둔다.
//  · Enter 다음 · Shift+Enter 이전 · Esc 닫기
//  · 범위는 "어디를"이 아니라 "무슨 글자를"로 고른다 — 묵자 / 점자.
//    한 화면에 묵자와 점자가 섞여 있어서, 원본·결과로 나누면 무엇을 어떻게 쳐야
//    하는지가 드러나지 않았다(2026-08-26 요청).
//  · 모드마다 존재하는 글자가 다르므로 없는 쪽은 잠근다(scopeAvailability 참고).
//  · 점자를 고르면 입력도 6점으로 바뀐다 — 로컬에 묵자→점자 번역기가 없어
//    (조판 라이브러리는 번역을 하지 않는다) 점형을 직접 찍어야 한다. 방식은 판면
//    격자와 같다: F D S · J K L 을 함께 누르고 떼면 한 글자가 커서 자리에 들어간다.
//  · 바꾸기는 **결과(출력)에만** 걸린다 — 원본 패널은 읽기 전용 미리보기다.

export type FindScope = 'original' | 'result';

// 범위 이름은 그 자리에 실제로 무슨 글자가 있는지로 적는다. 원본은 언제나 묵자고,
// 결과는 모드에 따라 묵자(초안 생성)이거나 점자(점자 번역)다 — "원본/결과"보다
// 무엇을 어떻게 쳐야 하는지가 바로 드러난다(2026-08-26 요청).
export const scopeLabels = (
  mode: ConversionTab,
): Record<FindScope, string> => ({
  original: '묵자',
  result: mode === TABS.OCR ? '묵자' : '점자',
});

// 그 모드에 없는 것은 잠근다.
//  a(초안 생성)      원본·결과 모두 묵자 → 점자로 입력할 것이 없다
//  b(텍스트 점자 번역) 원본은 묵자, 결과는 점자 → 둘 다
//  c(이미지 점자 번역) 원본이 그림이라 찾을 묵자가 없다
export const canSearchOriginal = (mode: ConversionTab) =>
  mode !== TABS.INTEGRATED;
export const canSearchBraille = (mode: ConversionTab) => mode !== TABS.OCR;

// 잠긴 범위에 남아 있지 않게 한다(탭을 옮기면 바뀔 수 있다).
export const resolveScope = (
  mode: ConversionTab,
  scope: FindScope,
): FindScope =>
  scope === 'original' && !canSearchOriginal(mode) ? 'result' : scope;

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  scope: FindScope;
  onScopeChange: (scope: FindScope) => void;
  brailleInput: boolean;
  onBrailleInputChange: (on: boolean) => void;
  // 범위 이름과 잠금은 모드가 정한다.
  mode: ConversionTab;
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
  mode,
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
  // 바꾸기 줄은 처음부터 펼쳐 둔다. 접어 두면 이런 기능이 있다는 걸 모른 채
  // 찾기만 쓰게 된다(2026-08-26 QA). 필요하면 접을 수는 있게 남긴다.
  const [showReplace, setShowReplace] = useState(true);
  const labels = scopeLabels(mode);
  const available: Record<FindScope, boolean> = {
    original: canSearchOriginal(mode),
    result: true,
  };
  // 원본은 읽기 전용이라 바꿀 수 없다 — 범위가 원본이면 잠근다.
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
          {(Object.keys(labels) as FindScope[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={scope === s}
              disabled={!available[s]}
              title={
                available[s]
                  ? undefined
                  : '이 모드의 원본은 그림이라 글자를 찾을 수 없습니다'
              }
              onClick={() => onScopeChange(s)}
              className={`rounded-[5px] px-2 py-0.5 text-[11px] font-bold transition-colors ${
                scope === s
                  ? 'bg-white text-[#5b8ce6]'
                  : 'text-gray-500 hover:text-[#5b8ce6]'
              } disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:text-gray-300`}
            >
              {labels[s]}
            </button>
          ))}
        </div>

        <label
          title={
            canSearchBraille(mode)
              ? '점자를 직접 찍어 찾습니다 — 판면과 같은 방식(F D S · J K L 함께 누르고 떼기)'
              : '이 모드에는 점자가 없습니다'
          }
          className={`flex items-center gap-1 text-[11px] font-bold ${
            canSearchBraille(mode)
              ? 'cursor-pointer text-gray-500'
              : 'cursor-not-allowed text-gray-300'
          }`}
        >
          <input
            type="checkbox"
            checked={brailleInput}
            disabled={!canSearchBraille(mode)}
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
              ? `원본은 바꿀 수 없습니다 — 범위를 ${labels.result}로 바꿔 주세요`
              : '결과(출력)만 바뀝니다'}
          </span>
        </div>
      )}
    </div>
  );
};

export default FindBar;
