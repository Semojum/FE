import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConversionTab, TABS } from '../../../types';
import {
  bodyRowsPerPage,
  CELLS_PER_ROW,
  clearCellAt,
  GridLine,
  overwriteAt,
  toCells,
  totalOutputPages,
} from '../../../utils/brailleGrid';

// Figma V3-03 에디터 — 26줄 × 32칸 점자 판면 격자.
//
// 출력 쪽은 페이지네이션으로 끊지 않고 세로로 계속 이어 붙여 스크롤한다.
// 칸을 클릭하면 그 줄이 통째로 선택되고, 커서는 클릭한 칸에 놓인다.
// 그 상태에서 타이핑하면 그 칸부터 덮어쓴다(칸이 밀리지 않는다).

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
  lineIndex: number;
  cell: number;
}

interface Props {
  lines: GridLine[];
  mode: ConversionTab;
  insertPageNumber: boolean;
  caret: GridCaret | null;
  // 원본 블록을 선택하면 그 블록의 줄들이 한 덩어리로 강조된다(원본 대조).
  highlightBlockId: string | null;
  onCaretChange: (caret: GridCaret) => void;
  onEditLine: (lineIndex: number, text: string) => void;
  onContextMenu: (lineIndex: number, x: number, y: number) => void;
  // 화면에 보이는 출력 쪽이 바뀔 때 (상단 "12 / 40쪽" 표시용)
  onVisiblePageChange?: (page: number) => void;
  // 원본 페이지를 넘겼을 때 그 지점으로 스크롤하기 위한 요청 신호
  scrollToLine?: number | null;
}

const BrailleGrid: React.FC<Props> = ({
  lines,
  mode,
  insertPageNumber,
  caret,
  highlightBlockId,
  onCaretChange,
  onEditLine,
  onContextMenu,
  onVisiblePageChange,
  scrollToLine,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // 점자 동시 입력 추적 — 키를 떼는 순간 한 글자로 합친다.
  const pressedDots = useRef<Set<string>>(new Set());
  const [isComposing, setIsComposing] = useState(false);

  const bodyRows = bodyRowsPerPage(insertPageNumber);
  const pageCount = totalOutputPages(lines.length, insertPageNumber);
  const isBraille = mode !== TABS.OCR;

  // 출력 쪽별로 줄을 나눈다.
  const pages = useMemo(
    () =>
      Array.from({ length: pageCount }, (_, p) => ({
        pageNo: p + 1,
        rows: Array.from({ length: bodyRows }, (_, r) => {
          const lineIndex = p * bodyRows + r;
          return lineIndex < lines.length
            ? { lineIndex, line: lines[lineIndex] }
            : { lineIndex, line: null };
        }),
      })),
    [lines, pageCount, bodyRows],
  );

  const caretLine = caret ? lines[caret.lineIndex] : null;

  // 선택한 줄로 포커스를 옮긴다 — 실제 입력은 숨은 input이 받는다(한글 IME 대응).
  useEffect(() => {
    if (caret) inputRef.current?.focus();
  }, [caret]);

  // 원본 페이지를 넘기면 결과 격자도 그 지점으로 옮겨 대조를 유지한다.
  useEffect(() => {
    if (scrollToLine == null) return;
    rowRefs.current[scrollToLine]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [scrollToLine]);

  // 스크롤 위치로 현재 보고 있는 출력 쪽을 계산한다.
  const handleScroll = useCallback(() => {
    if (!onVisiblePageChange) return;
    const el = scrollRef.current;
    if (!el) return;
    const pageHeight = el.scrollHeight / pageCount;
    const page = Math.min(
      pageCount,
      Math.max(1, Math.floor(el.scrollTop / pageHeight) + 1),
    );
    onVisiblePageChange(page);
  }, [onVisiblePageChange, pageCount]);

  const moveCaret = (lineIndex: number, cell: number) => {
    const clampedLine = Math.max(0, Math.min(lines.length - 1, lineIndex));
    onCaretChange({
      lineIndex: clampedLine,
      cell: Math.max(0, Math.min(CELLS_PER_ROW - 1, cell)),
    });
  };

  const applyText = (text: string) => {
    if (!caret) return;
    onEditLine(caret.lineIndex, text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!caret || !caretLine) return;

    // 점자 모드: SDF JKL 조합은 기본 문자 입력을 막고 점형으로 만든다.
    if (isBraille && BRAILLE_DOT_MAP[e.code]) {
      e.preventDefault();
      pressedDots.current.add(e.code);
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveCaret(caret.lineIndex, caret.cell - 1);
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveCaret(caret.lineIndex, caret.cell + 1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveCaret(caret.lineIndex - 1, caret.cell);
        return;
      case 'ArrowDown':
      case 'Enter':
        e.preventDefault();
        moveCaret(caret.lineIndex + 1, e.key === 'Enter' ? 0 : caret.cell);
        return;
      case 'Tab':
        e.preventDefault();
        // 줄 끝에서 Tab을 누르면 다음 줄 첫 칸으로 넘어간다.
        if (caret.cell >= CELLS_PER_ROW - 1) moveCaret(caret.lineIndex + 1, 0);
        else moveCaret(caret.lineIndex, caret.cell + 1);
        return;
      case 'Home':
        e.preventDefault();
        moveCaret(caret.lineIndex, 0);
        return;
      case 'End':
        e.preventDefault();
        moveCaret(caret.lineIndex, [...caretLine.text].length);
        return;
      case 'Backspace': {
        e.preventDefault();
        const target = Math.max(0, caret.cell - 1);
        applyText(clearCellAt(caretLine.text, target));
        moveCaret(caret.lineIndex, target);
        return;
      }
      case 'Delete':
        e.preventDefault();
        applyText(clearCellAt(caretLine.text, caret.cell));
        return;
      default:
        break;
    }

    // 일반 문자 — 삽입이 아니라 커서 칸부터 덮어쓴다.
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
      applyText(overwriteAt(caretLine.text, caret.cell, e.key));
      moveCaret(caret.lineIndex, caret.cell + 1);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isBraille || !BRAILLE_DOT_MAP[e.code] || !caret || !caretLine) return;
    e.preventDefault();
    if (pressedDots.current.size === 0) return;

    // 눌린 점을 합쳐 유니코드 점형 한 글자(U+2800 + 점 조합)로 만든다.
    let dots = 0;
    pressedDots.current.forEach((code) => {
      dots += BRAILLE_DOT_MAP[code];
    });
    pressedDots.current.clear();

    applyText(
      overwriteAt(
        caretLine.text,
        caret.cell,
        String.fromCharCode(0x2800 + dots),
      ),
    );
    moveCaret(caret.lineIndex, caret.cell + 1);
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLInputElement>,
  ) => {
    setIsComposing(false);
    if (!caret || !caretLine || !e.data) return;
    applyText(overwriteAt(caretLine.text, caret.cell, e.data));
    moveCaret(caret.lineIndex, caret.cell + [...e.data].length);
    // 숨은 input은 항상 비워 둔다 — 값은 격자가 들고 있다.
    if (inputRef.current) inputRef.current.value = '';
  };

  const cellCls = (selected: boolean, isCaret: boolean, blocked?: boolean) =>
    [
      'flex h-[19px] w-[19px] shrink-0 items-center justify-center border-r border-b text-[13px] leading-none',
      'border-[#e4ebf5]',
      isCaret
        ? 'bg-[#5b8ce6] text-white'
        : selected
          ? 'bg-[#5b8ce6]/10'
          : blocked
            ? 'bg-amber-50'
            : 'bg-white',
    ].join(' ');

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="custom-scrollbar h-full overflow-y-auto bg-[#fafcff]"
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

      {pages.map((page) => (
        <div key={page.pageNo} className="mb-5 px-3 pt-2">
          {/* 칸 눈금 */}
          <div className="mb-0.5 flex pl-[26px] text-[9px] text-gray-400">
            {Array.from({ length: CELLS_PER_ROW }, (_, i) => (
              <span key={i} className="w-[19px] shrink-0 text-center">
                {i === 0 || (i + 1) % 8 === 0 ? i + 1 : ''}
              </span>
            ))}
          </div>

          <div className="border-l border-t border-[#e4ebf5]">
            {page.rows.map(({ lineIndex, line }, rowInPage) => {
              const isSelected = caret?.lineIndex === lineIndex && !!line;
              const isHighlighted =
                !!line &&
                !!highlightBlockId &&
                line.blockId === highlightBlockId;
              // 한 블록이 여러 줄이면 줄마다 테두리를 그리지 않고 한 덩어리로 감싼다.
              const isBlockTop =
                isHighlighted &&
                lines[lineIndex - 1]?.blockId !== line?.blockId;
              const isBlockBottom =
                isHighlighted &&
                lines[lineIndex + 1]?.blockId !== line?.blockId;
              const cells = toCells(line?.text ?? '');

              return (
                <div
                  key={lineIndex}
                  ref={(el) => {
                    rowRefs.current[lineIndex] = el;
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
                  <span className="flex h-[19px] w-[26px] shrink-0 items-center justify-end pr-1.5 text-[9px] text-gray-400">
                    {rowInPage + 1}
                  </span>
                  {cells.map((ch, cellIdx) => (
                    <div
                      key={cellIdx}
                      role="gridcell"
                      tabIndex={-1}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (line) moveCaret(lineIndex, cellIdx);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!line) return;
                        moveCaret(lineIndex, cellIdx);
                        onContextMenu(lineIndex, e.clientX, e.clientY);
                      }}
                      className={cellCls(
                        isSelected,
                        isSelected && caret?.cell === cellIdx,
                        line?.isBlocked,
                      )}
                    >
                      {ch}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* 쪽번호 줄 — 본문에서 한 줄을 빼서 마지막 줄에 쪽번호를 넣는다. */}
            {insertPageNumber && (
              <div className="flex">
                <span className="h-[19px] w-[26px] shrink-0" />
                {Array.from({ length: CELLS_PER_ROW }, (_, i) => {
                  const label = String(page.pageNo);
                  // 오른쪽 끝에 붙인다.
                  const start = CELLS_PER_ROW - label.length;
                  return (
                    <div
                      key={i}
                      className="flex h-[19px] w-[19px] shrink-0 items-center justify-center border-r border-b border-[#e4ebf5] bg-[#f6f9fe] text-[12px] leading-none text-gray-500"
                    >
                      {i >= start ? label[i - start] : ''}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default BrailleGrid;
