import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConversionTab, TABS } from '../../../types';
import { deleteAt, deleteBefore, insertAt, toCells } from '../../../utils/brailleGrid';
import {
  CELLS_PER_ROW,
  flattenRows,
  LayoutPage,
  LayoutRow,
} from '../../../utils/brailleLayout';

// Figma V3-03 에디터 — 26줄 × 32칸 점자 판면 격자.
//
// 판면 배치는 braille-assist가 만든다(32칸 줄바꿈 · 원본 쪽 변경선 · 면 나눔 · 페이지행).
// 이 컴포넌트는 그 결과를 그리고 본문 행에만 커서를 놓는다 — 조판 규칙은 여기 없다.
//
// 출력 쪽은 페이지네이션으로 끊지 않고 세로로 계속 이어 붙여 스크롤한다.
// 칸을 클릭하면 그 줄이 통째로 선택되고, 커서는 클릭한 칸에 놓인다.
// 그 상태에서 타이핑하면 그 칸에 글자가 끼워지고 뒤쪽 글자는 오른쪽으로 밀린다.
// 한 줄이 32칸을 넘으면 다음 행으로 접힌다 — 다운로드 파일과 같은 자리에서 나뉜다.

// 점자 직접 입력 (표준 Perkins 6점: SDF JKL). 물리 키 기준이라 한/영 상태와 무관하다.
const BRAILLE_DOT_MAP: Record<string, number> = {
  KeyF: 1, // 1점
  KeyD: 2, // 2점
  KeyS: 4, // 3점
  KeyJ: 8, // 4점
  KeyK: 16, // 5점
  KeyL: 32, // 6점
};

export interface GridCaret {
  rowIndex: number;
  cell: number;
}

interface Props {
  pages: LayoutPage[];
  mode: ConversionTab;
  caret: GridCaret | null;
  // 원본 블록을 선택하면 그 블록의 줄들이 한 덩어리로 강조된다(원본 대조).
  highlightBlockId: string | null;
  onCaretChange: (caret: GridCaret) => void;
  onEditRow: (rowIndex: number, text: string) => void;
  onContextMenu: (rowIndex: number, x: number, y: number) => void;
  // 화면에 보이는 출력 쪽이 바뀔 때 (상단 "12 / 40쪽" 표시용)
  onVisiblePageChange?: (page: number) => void;
  // 원본 페이지를 넘겼을 때 그 지점으로 스크롤하기 위한 요청 신호
  scrollToRow?: number | null;
}

const BrailleGrid: React.FC<Props> = ({
  pages,
  mode,
  caret,
  highlightBlockId,
  onCaretChange,
  onEditRow,
  onContextMenu,
  onVisiblePageChange,
  scrollToRow,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // 점자 동시 입력 추적 — 키를 떼는 순간 한 글자로 합친다.
  const pressedDots = useRef<Set<string>>(new Set());
  const [isComposing, setIsComposing] = useState(false);

  const isBraille = mode !== TABS.OCR;
  const rows = useMemo(() => flattenRows(pages), [pages]);
  // 각 면의 첫 행이 전체에서 몇 번째인지 — 행 번호와 커서는 전체 기준으로 센다.
  const pageStarts = useMemo(() => {
    let acc = 0;
    return pages.map((p) => {
      const start = acc;
      acc += p.rows.length;
      return start;
    });
  }, [pages]);

  const caretRow = caret ? rows[caret.rowIndex] : null;

  // 커서는 본문 행에만 놓인다 — 변경선·페이지행·여백은 건너뛴다.
  const nearestBody = useCallback(
    (from: number, dir: 1 | -1): number => {
      for (let i = from; i >= 0 && i < rows.length; i += dir) {
        if (rows[i].kind === 'body') return i;
      }
      return -1;
    },
    [rows],
  );

  // 선택한 줄로 포커스를 옮긴다 — 실제 입력은 숨은 input이 받는다(한글 IME 대응).
  // preventScroll: 이 input은 화면 밖(fixed·0px)에 있어 그냥 focus하면 브라우저가
  // 격자를 그 자리로 스크롤한다. 그 스크롤이 방금 연 우클릭 메뉴를 즉시 닫았다.
  useEffect(() => {
    if (caret) inputRef.current?.focus({ preventScroll: true });
  }, [caret]);

  // 원본 페이지를 넘기면 결과 격자도 그 지점으로 옮겨 대조를 유지한다.
  useEffect(() => {
    if (scrollToRow == null) return;
    rowRefs.current[scrollToRow]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [scrollToRow]);

  // 스크롤 위치로 현재 보고 있는 출력 쪽을 계산한다.
  const handleScroll = useCallback(() => {
    if (!onVisiblePageChange || pages.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const pageHeight = el.scrollHeight / pages.length;
    const page = Math.min(
      pages.length,
      Math.max(1, Math.floor(el.scrollTop / pageHeight) + 1),
    );
    onVisiblePageChange(page);
  }, [onVisiblePageChange, pages.length]);

  // 칸이 줄 밖으로 나가면 이웃한 본문 행으로 넘어간다(32칸에서 접히므로 자연스럽게 이어진다).
  const moveCaret = (rowIndex: number, cell: number) => {
    if (rowIndex < 0 || rowIndex >= rows.length) return;
    let target = rowIndex;
    let targetCell = cell;

    if (cell < 0) {
      // 줄 앞을 넘어가면 앞 본문 행의 끝으로. 더 앞이 없으면 첫 칸에 머문다.
      const prev = nearestBody(rowIndex - 1, -1);
      if (prev === -1) targetCell = 0;
      else {
        target = prev;
        targetCell = Math.max(0, [...rows[prev].text].length - 1);
      }
    } else if (cell >= CELLS_PER_ROW) {
      // 32칸을 넘어가면 다음 본문 행 첫 칸으로 — 접힌 글자를 따라간다.
      const next = nearestBody(rowIndex + 1, 1);
      if (next === -1) targetCell = CELLS_PER_ROW - 1;
      else {
        target = next;
        targetCell = 0;
      }
    }

    if (rows[target]?.kind !== 'body') return;
    onCaretChange({
      rowIndex: target,
      cell: Math.min(CELLS_PER_ROW - 1, Math.max(0, targetCell)),
    });
  };

  const applyText = (text: string) => {
    if (!caret) return;
    onEditRow(caret.rowIndex, text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!caret || !caretRow) return;

    // 점자 모드: SDF JKL 조합은 기본 문자 입력을 막고 점형으로 만든다.
    if (isBraille && BRAILLE_DOT_MAP[e.code]) {
      e.preventDefault();
      pressedDots.current.add(e.code);
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveCaret(caret.rowIndex, caret.cell - 1);
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveCaret(caret.rowIndex, caret.cell + 1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveCaret(nearestBody(caret.rowIndex - 1, -1), caret.cell);
        return;
      case 'ArrowDown':
      case 'Enter':
        e.preventDefault();
        moveCaret(
          nearestBody(caret.rowIndex + 1, 1),
          e.key === 'Enter' ? 0 : caret.cell,
        );
        return;
      case 'Tab':
        e.preventDefault();
        moveCaret(caret.rowIndex, caret.cell + 1);
        return;
      case 'Home':
        e.preventDefault();
        moveCaret(caret.rowIndex, 0);
        return;
      case 'End':
        e.preventDefault();
        moveCaret(caret.rowIndex, [...caretRow.text].length);
        return;
      case 'Backspace':
        e.preventDefault();
        // 앞 글자를 지우고 뒤쪽을 왼쪽으로 당긴다.
        applyText(deleteBefore(caretRow.text, caret.cell));
        moveCaret(caret.rowIndex, caret.cell - 1);
        return;
      case 'Delete':
        e.preventDefault();
        applyText(deleteAt(caretRow.text, caret.cell));
        return;
      default:
        break;
    }

    // 일반 문자 — 커서 칸에 끼워 넣고 뒤쪽을 오른쪽으로 민다.
    // 한글은 IME 조합 중이라 여기로 오지 않고 compositionend에서 처리된다.
    // 단축키(Ctrl+Z/S 등)는 상위 핸들러가 처리하도록 넘긴다.
    if (
      !isComposing &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      [...e.key].length === 1
    ) {
      e.preventDefault();
      // 점자 모드에서 받는 문자는 6점 키 조합(위에서 처리)과 빈 칸뿐이다.
      // 나머지 문자키는 삼킨다 — 퍼킨스 타법에서 S·D·F·J·K·L 옆의 A·G·H 등을
      // 잘못 눌렀을 때 그 영문자가 그대로 판면에 찍히던 문제를 막는다.
      if (isBraille && e.key !== ' ') return;
      applyText(insertAt(caretRow.text, caret.cell, e.key));
      moveCaret(caret.rowIndex, caret.cell + 1);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isBraille || !BRAILLE_DOT_MAP[e.code] || !caret || !caretRow) return;
    e.preventDefault();
    if (pressedDots.current.size === 0) return;

    // 눌린 점을 합쳐 유니코드 점형 한 글자(U+2800 + 점 조합)로 만든다.
    let dots = 0;
    pressedDots.current.forEach((code) => {
      dots += BRAILLE_DOT_MAP[code];
    });
    pressedDots.current.clear();

    applyText(
      insertAt(caretRow.text, caret.cell, String.fromCharCode(0x2800 + dots)),
    );
    moveCaret(caret.rowIndex, caret.cell + 1);
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLInputElement>,
  ) => {
    setIsComposing(false);
    // 숨은 input은 항상 비워 둔다 — 값은 격자가 들고 있다.
    if (inputRef.current) inputRef.current.value = '';
    if (!caret || !caretRow || !e.data) return;
    // 점자 모드에서는 IME 조합 결과(한글)를 넣지 않는다. keydown의 preventDefault로는
    // IME를 막을 수 없어, 한/영 상태가 한글일 때 점형과 한글이 같이 들어가던 문제.
    if (isBraille) return;
    applyText(insertAt(caretRow.text, caret.cell, e.data));
    moveCaret(caret.rowIndex, caret.cell + [...e.data].length);
  };

  const cellCls = (
    row: LayoutRow,
    selected: boolean,
    isCaret: boolean,
  ): string =>
    [
      'flex h-[19px] w-[19px] shrink-0 items-center justify-center border-r border-b text-[13px] leading-none',
      'border-[#e4ebf5]',
      isCaret
        ? 'bg-[#5b8ce6] text-white'
        : selected
          ? 'bg-[#5b8ce6]/10'
          : row.kind === 'fixed'
            ? // 변경선·페이지행은 조판이 만든 줄이라 고칠 수 없다 — 눌러서 구분되게 한다.
              'bg-[#f2f5fa] text-gray-400'
            : row.source?.isBlocked
              ? 'bg-amber-50'
              : 'bg-white',
    ].join(' ');

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="custom-scrollbar h-full overflow-auto bg-[#fafcff]"
    >
      {/* 실제 키 입력을 받는 숨은 input — 한글 IME 조합을 위해 진짜 입력 요소가 필요하다. */}
      <input
        ref={inputRef}
        aria-label="점자 판면 편집"
        value=""
        onChange={() => undefined}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={handleCompositionEnd}
        className="pointer-events-none fixed h-0 w-0 opacity-0"
      />

      {pages.map((page, pageIdx) => (
        // w-max: 면의 폭은 패널이 아니라 32칸 내용이 정한다. 예전에는 행이 패널 폭에
        // 맞춰지고 칸은 그 밖으로 넘쳐서, 블록 강조 테두리가 32칸까지 가지 못하고
        // 31칸 언저리에서 잘렸다. 패널이 좁으면 가로로 스크롤한다.
        <div key={page.braillePage} className="mb-5 w-max px-3 pt-2">
          {/* 칸 눈금 */}
          <div className="mb-0.5 flex w-max pl-[26px] text-[9px] text-gray-400">
            {Array.from({ length: CELLS_PER_ROW }, (_, i) => (
              <span key={i} className="w-[19px] shrink-0 text-center">
                {i === 0 || (i + 1) % 8 === 0 ? i + 1 : ''}
              </span>
            ))}
          </div>

          <div className="w-max border-l border-t border-[#e4ebf5]">
            {page.rows.map((row, rowInPage) => {
              const rowIndex = pageStarts[pageIdx] + rowInPage;
              const editable = row.kind === 'body';
              const isSelected = caret?.rowIndex === rowIndex && editable;
              const isHighlighted =
                !!highlightBlockId && row.source?.blockId === highlightBlockId;
              // 한 블록이 여러 줄이면 줄마다 테두리를 그리지 않고 한 덩어리로 감싼다.
              const isBlockTop =
                isHighlighted &&
                rows[rowIndex - 1]?.source?.blockId !== row.source?.blockId;
              const isBlockBottom =
                isHighlighted &&
                rows[rowIndex + 1]?.source?.blockId !== row.source?.blockId;
              const cells = toCells(row.text);

              return (
                <div
                  key={rowIndex}
                  ref={(el) => {
                    rowRefs.current[rowIndex] = el;
                  }}
                  className={[
                    'flex',
                    isHighlighted
                      ? 'border-x-2 border-[#f47726] bg-[#f47726]/[0.04]'
                      : 'border-x-2 border-transparent',
                    isBlockTop ? 'border-t-2 border-t-[#f47726]' : '',
                    isBlockBottom ? 'border-b-2 border-b-[#f47726]' : '',
                  ].join(' ')}
                >
                  {/* 대체 초안이 있는 블록은 줄번호 옆에 점을 찍는다 — 진입점이
                      우클릭 메뉴뿐이라 초안이 있는지 알 방법이 없었다. */}
                  <span
                    title={
                      row.source?.hasDrafts
                        ? '대체 초안이 있는 블록 — 우클릭해서 고를 수 있습니다'
                        : undefined
                    }
                    className="flex h-[19px] w-[26px] shrink-0 items-center justify-end gap-0.5 pr-1.5 text-[9px] text-gray-400"
                  >
                    {row.source?.hasDrafts && (
                      <span aria-label="대체 초안 있음" className="text-[#f47726]">
                        •
                      </span>
                    )}
                    {rowInPage + 1}
                  </span>
                  {cells.map((ch, cellIdx) => (
                    <div
                      key={cellIdx}
                      role="gridcell"
                      tabIndex={-1}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (editable) moveCaret(rowIndex, cellIdx);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!editable) return;
                        moveCaret(rowIndex, cellIdx);
                        onContextMenu(rowIndex, e.clientX, e.clientY);
                      }}
                      className={cellCls(
                        row,
                        isSelected,
                        isSelected && caret?.cell === cellIdx,
                      )}
                    >
                      {ch}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default BrailleGrid;
