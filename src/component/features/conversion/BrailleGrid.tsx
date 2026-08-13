import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConversionTab, TABS } from '../../../types';
import {
  deleteAt,
  deleteBefore,
  insertAt,
  toCells,
} from '../../../utils/brailleGrid';
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

// `<!…>` 꼴 표식(`<!점역자주>`, `<!/점역자주>`, `<!표>` …)은 **표식 자체만**
// 글자색을 흐리게 그린다. 안쪽 내용은 본문이므로 그대로 두고, 칸 배경도 건드리지
// 않는다 — 배경을 칠하면 선택(대조)·검토 필요 표시와 섞인다.
// 지우지 않는 이유: FE가 벗기면 다운로드 파일과 어긋난다(BE·AI 몫).
// (QA "mode a 우측의 점자 태깅 회색 글자 처리" — 가독성)
//
// 어떤 표식이 더 생길지 목록으로 못 박을 수 없으므로 종류가 아니라 모양으로 찾는다.
// 모드를 가리지 않는다 — 본문에 이 모양이 실려 오면 어느 모드든 흐려진다.
//
// <!…> 한 개가 차지할 수 있는 최대 길이. 여는 `<!` 뒤에 닫는 `>`가 이 안에 없으면
// 표식이 아니라 우연히 나온 글자로 본다 — 판면이 통째로 회색이 되는 쪽이 더 나쁘다.
const MAX_TAG_LEN = 40;

// 본문 행을 순서대로 이어 읽으며 표식이 차지하는 칸을 표시한다.
// 표식이 32칸 경계에서 잘려 다음 행으로 넘어가도 이어서 잡힌다.
const buildTagMask = (rows: LayoutRow[]): boolean[][] => {
  const mask = rows.map((r) => [...r.text].map(() => false));
  const coords: Array<[number, number]> = [];
  const chars: string[] = [];
  const blockIds: Array<string | undefined> = [];
  rows.forEach((row, rowIdx) => {
    if (row.kind !== 'body') return;
    [...row.text].forEach((ch, cellIdx) => {
      coords.push([rowIdx, cellIdx]);
      chars.push(ch);
      blockIds.push(row.source?.blockId);
    });
  });

  // 코드포인트 배열 위에서 직접 찾는다 — 인덱스가 곧 칸 번호라 좌표가 어긋나지 않는다.
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] !== '<' || chars[i + 1] !== '!') continue;
    const block = blockIds[i];
    const limit = Math.min(chars.length, i + MAX_TAG_LEN);
    let end = -1;
    for (let j = i + 2; j < limit && blockIds[j] === block; j += 1) {
      if (chars[j] === '>') {
        end = j;
        break;
      }
    }
    if (end === -1) continue; // 닫히지 않았으면 표식으로 보지 않는다
    for (let k = i; k <= end; k += 1) {
      const [rowIdx, cellIdx] = coords[k];
      mask[rowIdx][cellIdx] = true;
    }
    i = end;
  }
  return mask;
};

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
  // 마우스가 얹힌 블록 — 그 블록의 줄들을 상자로 감싼다(원본 패널의 블록 hover와 같은 방식).
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);

  const isBraille = mode !== TABS.OCR;
  const rows = useMemo(() => flattenRows(pages), [pages]);
  // 점역자주 태그가 놓인 칸 — 회색으로 흐리게 그린다.
  const tagMask = useMemo(() => buildTagMask(rows), [rows]);
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

  // 비제어 input이라 조합이 끝나지 않은 사이에도 값이 남는다. 조합 중이 아닌 입력
  // (붙여넣기 등 keydown을 거치지 않는 경로)만 여기서 받아 격자에 넣고 input을 비운다.
  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    // 조합 중에는 건드리지 않는다 — compositionend가 처리한다.
    // (브라우저마다 마지막 input과 compositionend의 순서가 달라 양쪽으로 막는다.)
    if (isComposing || (e.nativeEvent as InputEvent).isComposing) return;
    const el = e.currentTarget;
    const value = el.value;
    el.value = '';
    if (!value || !caret || !caretRow) return;
    if (isBraille) return; // 점자 모드는 6점 키 조합만 받는다
    applyText(insertAt(caretRow.text, caret.cell, value));
    moveCaret(caret.rowIndex, caret.cell + [...value].length);
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
    highlighted: boolean,
    dimmed: boolean,
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
            : // 디자인 V3/BlockCard의 세 상태를 격자에 옮긴 것.
              //  review(검토 필요) — 크림 배경 + 주황 테두리 (테두리는 행 단위로 그린다)
              //  selected(원본 대조) — 연한 주황 배경. 디자인은 주황 테두리지만 그 뜻이
              //    전달되지 않아 배경색으로 바꿨다 (QA "AI 생성 블록 표기 방식 변경").
              //    review와 헷갈리지 않도록 크림(노랑기)과 주황기로 색을 갈라 둔다.
              row.source?.isBlocked
              ? 'bg-[#fdf8e3]'
              : highlighted
                ? 'bg-[#fbe4d3]'
                : 'bg-white',
      // 점역자주 태그는 본문에 남겨 두되 흐리게 그려 읽기를 방해하지 않게 한다.
      dimmed && !isCaret ? 'text-[#c8ccd4]' : '',
    ].join(' ');

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onMouseLeave={() => setHoverBlockId(null)}
      className="custom-scrollbar h-full overflow-auto bg-[#fafcff]"
    >
      {/* 실제 키 입력을 받는 숨은 input — 한글 IME 조합을 위해 진짜 입력 요소가 필요하다.
          value를 ''로 고정한 제어 컴포넌트로 두면 안 된다: 조합 중에도 React가 매 렌더마다
          값을 ''로 되돌려 IME 조합 버퍼가 끊긴다(영문은 keydown에서 직접 넣어 멀쩡했고
          한글만 입력되지 않았다 — QA "mode a 우측 한글 입력 안됨").
          비제어로 두고 조합이 끝난 뒤 handleCompositionEnd가 직접 비운다. */}
      <input
        ref={inputRef}
        aria-label="점자 판면 편집"
        defaultValue=""
        onInput={handleInput}
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
        <div key={page.braillePage} className="mb-5 w-max px-1 pt-2">
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
              const cells = toCells(row.text);
              const dimMaskRow = tagMask[rowIndex] ?? [];
              // 검토 필요(review) 블록은 디자인대로 주황 테두리로 감싼다 —
              // 배경색만으로 알리는 선택(대조) 상태와 섞이지 않게 하는 구분이기도 하다.
              // 한 블록이 여러 줄이면 줄마다 그리지 않고 한 덩어리로 두른다.
              const isReview = !!row.source?.isBlocked;
              const sameBlock = (other?: LayoutRow) =>
                other?.source?.blockId === row.source?.blockId;
              // 마우스를 얹으면 그 블록을 상자로 감싼다 — 왼쪽 원본 패널의 텍스트 블록과
              // 같은 방식으로, 어디까지가 한 블록인지 짚어 준다.
              const isHovered =
                !!row.source?.blockId && row.source.blockId === hoverBlockId;
              // Tailwind는 클래스 문자열을 정적으로 훑으므로 색을 템플릿으로 조립하지 않는다.
              const box = isReview
                ? {
                    x: 'border-x-2 border-[#f47726]',
                    t: 'border-t-2 border-t-[#f47726]',
                    b: 'border-b-2 border-b-[#f47726]',
                  }
                : isHovered
                  ? {
                      x: 'border-x-2 border-[#c3cfdd]',
                      t: 'border-t-2 border-t-[#c3cfdd]',
                      b: 'border-b-2 border-b-[#c3cfdd]',
                    }
                  : { x: 'border-x-2 border-transparent', t: '', b: '' };

              return (
                <div
                  key={rowIndex}
                  ref={(el) => {
                    rowRefs.current[rowIndex] = el;
                  }}
                  onMouseEnter={() =>
                    setHoverBlockId(row.source?.blockId ?? null)
                  }
                  className={[
                    'flex',
                    box.x,
                    !sameBlock(rows[rowIndex - 1]) ? box.t : '',
                    !sameBlock(rows[rowIndex + 1]) ? box.b : '',
                  ].join(' ')}
                >
                  {/* 대체 텍스트가 있는지는 결과 패널 위 [대체 텍스트] 버튼이 알려 준다 —
                      줄번호 옆 주황 점은 판면을 어지럽혀 뺐다. 안내는 툴팁으로만 남긴다. */}
                  <span
                    title={
                      row.source?.hasDrafts
                        ? '대체 텍스트가 있는 블록입니다'
                        : undefined
                    }
                    className="flex h-[19px] w-[26px] shrink-0 items-center justify-end pr-1.5 text-[9px] text-gray-400"
                  >
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
                        isHighlighted,
                        dimMaskRow[cellIdx] === true,
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
