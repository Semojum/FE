import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  codesToCell,
  isDotCode,
  isBrailleText,
} from '../../../utils/brailleInput';

// 찾기·바꾸기 입력칸. "점자로 입력"을 켜면 6점 입력으로 바뀐다.
//
// 로컬에는 묵자→점자 번역기가 없다(조판 라이브러리는 번역을 하지 않는다). 그래서
// 점자를 찾거나 점자로 바꾸려면 점형을 직접 찍어야 한다.
//
// 입력 방식은 판면 격자(출력란)와 똑같이 맞춘다 — 같은 앱에서 점자를 넣는 방법이
// 두 가지면 안 된다. 격자 규칙(BrailleGrid):
//  · F D S · J K L 을 화음처럼 함께 누르고 **떼는 순간** 점형 한 글자가 들어간다
//  · 키는 자판 배열과 무관하게 e.code로 본다(한글 자판에서도 같은 자리)
//  · 스페이스는 빈 칸을 넣고, 그 밖의 문자키는 삼킨다(A·G·H 오타가 찍히지 않게)
//  · 글자는 **커서 자리**에 끼워 넣고 뒤쪽을 오른쪽으로 민다
//    (예전에는 스페이스로 확정하고 늘 끝에만 붙어, 커서를 옮겨도 소용이 없었다)

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

  // 함께 누른 점들 — 격자와 같이 키를 떼는 순간 한 글자로 합친다.
  const pressedDots = useRef<Set<string>>(new Set());
  // 끼워 넣은 뒤 커서를 놓을 자리. 제어 입력이라 값이 다시 그려지면 커서가 끝으로
  // 튀므로, 렌더가 끝난 뒤(useLayoutEffect)에 제자리로 돌려놓는다.
  const pendingCaret = useRef<number | null>(null);
  // 한글 조합 중에는 Enter를 넘기지 않는다(조합 확정과 겹친다).
  const composing = useRef(false);

  useEffect(() => {
    if (!autoFocus && focusToken === undefined) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [autoFocus, focusToken]);

  // 입력 방식을 바꾸면 누르고 있던 점은 버린다.
  useEffect(() => pressedDots.current.clear(), [brailleInput]);

  // 커서 자리에 끼워 넣고, 커서를 그 글자 뒤로 옮긴다(격자의 밀어쓰기와 같다).
  const insertAtCaret = (text: string) => {
    const el = inputRef.current;
    const chars = [...draft];
    const start = el?.selectionStart ?? chars.length;
    const end = el?.selectionEnd ?? start;
    const next = [...chars.slice(0, start), text, ...chars.slice(end)].join('');
    emitted.current = next;
    pendingCaret.current = start + [...text].length;
    setDraft(next);
    onChange(next);
  };

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret == null) return;
    pendingCaret.current = null;
    inputRef.current?.setSelectionRange(caret, caret);
  }, [draft]);

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

    // 점자 모드: 6점 키는 눌린 것만 모아 두고, 떼는 순간 한 글자로 만든다.
    if (isDotCode(e.code)) {
      e.preventDefault();
      pressedDots.current.add(e.code);
      return;
    }
    // 지우기·이동은 입력칸에 맡긴다(커서를 옮겨 고칠 수 있어야 한다).
    if (
      e.key === 'Backspace' ||
      e.key === 'Delete' ||
      e.key.startsWith('Arrow') ||
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      return;
    }
    // 점자 모드에서 받는 문자는 6점 조합과 빈 칸뿐이다 — 나머지 문자키는 삼킨다.
    // (퍼킨스 타법에서 S·D·F·J·K·L 옆의 A·G·H를 잘못 눌러도 찍히지 않게)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && [...e.key].length === 1) {
      e.preventDefault();
      if (e.key === ' ') insertAtCaret(' ');
    }
  };

  // 점자 모드에서 받아들일 글자 — 점형(U+2800~U+28FF)과 빈 칸뿐이다.
  // 한/영 상태가 한글이면 IME가 keydown을 가로채므로 위의 문자키 차단이 통하지 않고,
  // 조합 결과가 input 값으로 들어와 점자와 한글이 섞여 나왔다(2026-08-25 QA).
  // 판면 격자는 조합 이벤트에서 같은 이유로 일찍 빠져나온다 — 여기도 같게 맞춘다.
  const keepBrailleOnly = (text: string) =>
    [...text].filter((ch) => isBrailleText(ch) || ch === ' ').join('');

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!brailleInput || !isDotCode(e.code)) return;
    e.preventDefault();
    if (pressedDots.current.size === 0) return;

    const cell = codesToCell(pressedDots.current);
    pressedDots.current.clear();
    insertAtCaret(cell);
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      aria-label={label}
      placeholder={
        brailleInput ? 'F D S · J K L 함께 눌러 점 찍기' : placeholder
      }
      onChange={(e) => {
        // 점자 모드에서 값이 바뀌는 경로는 붙여넣기·지우기·IME 조합이다.
        // 조합으로 들어온 한글은 여기서 걸러 낸다(문자키는 keydown에서 막았다).
        const next = brailleInput
          ? keepBrailleOnly(e.target.value)
          : e.target.value;
        emitted.current = next;
        setDraft(next);
        onChange(next);
      }}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        // 점자 모드에서는 조합 결과를 넣지 않는다. 확정된 글자가 input에 남아 있으므로
        // 점형만 남기고 되돌린다(막지 않으면 "⠁가⠃"처럼 섞인다).
        if (!brailleInput) return;
        const el = e.currentTarget;
        const kept = keepBrailleOnly(el.value);
        if (kept === el.value) return;
        el.value = kept;
        emitted.current = kept;
        setDraft(kept);
        onChange(kept);
      }}
      className={`h-[26px] rounded-[6px] border border-[#e2e8f0] px-2 text-[12px] text-gray-700 outline-none focus:border-[#5b8ce6] ${className}`}
    />
  );
};

export default DotInput;
