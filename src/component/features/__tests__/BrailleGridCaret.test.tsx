import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useEffect, useMemo, useState } from 'react';
import BrailleGrid, {
  type GridCaret,
} from '../conversion/BrailleGrid';
import {
  blockTextWithRowEdit,
  buildLayout,
  flattenRows,
} from '../../../utils/brailleLayout';
import { DEFAULT_TYPESET } from '../../../utils/typesetOptions';
import { TABS } from '../../../types';
import type { TranslationBlock } from '../../../types';

// 편집 고리를 App과 같은 모양으로 세운다 — 한 행을 고치면 블록 본문에 되돌리고
// 문서 전체가 다시 조판된다. 그래서 고친 자리 뒤는 전부 밀린다.
//
// 밀리는 것 자체는 조판이라 맞다. 문제는 커서였다. 예전에는 편집 직후 **편집 전**
// 줄 목록으로 다음 줄을 찾아 옮겨서, 문서 끝 줄이 꽉 찬 채로 이어 치면 커서가 방금
// 친 글자 위에 앉았다 — 다음 글자가 그 앞에 끼워져 "12"가 "21"이 됐다(2026-08-31).

const COLS = DEFAULT_TYPESET.cols;

const block = (id: string, text: string): TranslationBlock =>
  ({ id, currentText: text, originalText: text, candidates: [] }) as TranslationBlock;

interface Peek {
  rows: ReturnType<typeof flattenRows>;
  caret: GridCaret | null;
}

const Harness: React.FC<{
  text: string;
  caret0: GridCaret;
  onState: (rows: Peek['rows'], caret: GridCaret | null) => void;
}> = ({ text, caret0, onState }) => {
  const [blocks, setBlocks] = useState<Record<number, TranslationBlock[]>>({
    1: [block('b1', text)],
  });
  const [caret, setCaret] = useState<GridCaret | null>(caret0);
  const layout = useMemo(
    () => buildLayout(blocks, false, '', DEFAULT_TYPESET),
    [blocks],
  );
  const rows = useMemo(() => flattenRows(layout), [layout]);
  // 렌더 중이 아니라 그린 뒤에 지금 값을 내보낸다.
  useEffect(() => onState(rows, caret));

  const onEditRow = (rowIndex: number, next: string) => {
    const row = rows[rowIndex];
    const src = row?.source;
    if (!src) return;
    setBlocks((prev) => ({
      ...prev,
      [src.pageNo]: prev[src.pageNo].map((b) =>
        b.id === src.blockId
          ? {
              ...b,
              currentText: blockTextWithRowEdit(
                b.currentText,
                src,
                row.text,
                next,
              ),
            }
          : b,
      ),
    }));
  };

  return (
    <BrailleGrid
      pages={layout}
      // 묵자 모드 — 일반 키 입력이 그대로 들어간다(점자 모드는 6점 조합만 받는다).
      mode={TABS.OCR}
      caret={caret}
      highlightBlockId={null}
      onCaretChange={setCaret}
      onEditRow={onEditRow}
      onContextMenu={() => {}}
    />
  );
};

const press = (key: string) => {
  const input = document.querySelector('input') as HTMLInputElement;
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
};

/** 본문 행만 이어 붙인 글자 — 조판이 접은 자리는 신경 쓰지 않는다. */
const bodyText = (peek: Peek) =>
  peek.rows
    .filter((r) => r.kind === 'body')
    .map((r) => r.text)
    .join('');

const setup = (text: string, caret0: GridCaret) => {
  const peek: Peek = { rows: [], caret: null };
  render(
    <Harness
      text={text}
      caret0={caret0}
      onState={(rows, caret) => {
        peek.rows = rows;
        peek.caret = caret;
      }}
    />,
  );
  return peek;
};

describe('밀리는 판면에서 커서가 글자를 따라가는가', () => {
  const full = 'A'.repeat(COLS);

  it('문서 끝 줄이 꽉 찬 채로 이어 쳐도 순서가 지켜진다', () => {
    const peek = setup(full, { rowIndex: 0, cell: COLS - 1 });
    press('1');
    press('2');
    expect(bodyText(peek).replace(/A/g, '')).toBe('12');
  });

  it('줄 끝에서 한 글자를 치면 커서가 넘어간 글자 뒤로 따라간다', () => {
    const peek = setup(full, { rowIndex: 0, cell: COLS - 1 });
    press('Z');
    // 친 글자는 접히기 전 행의 마지막 칸에 남고, 밀려난 글자가 다음 행으로 간다.
    expect([...peek.rows[0].text][COLS - 1]).toBe('Z');
    // 커서는 그 다음 자리 — 다음 행 첫 칸이다.
    expect(peek.caret).toEqual({ rowIndex: 1, cell: 0 });
  });

  it('문서 중간에서도 같다 — 뒤 블록이 밀려도 커서는 제자리', () => {
    const peek = setup(`${full}\n뒷줄`, { rowIndex: 0, cell: COLS - 1 });
    press('Z');
    expect([...peek.rows[0].text][COLS - 1]).toBe('Z');
    expect(peek.caret).toEqual({ rowIndex: 1, cell: 0 });
    // 뒤 논리 줄은 그대로 살아 있다.
    expect(bodyText(peek)).toContain('뒷줄');
  });

  it('줄 가운데에서 치면 커서가 한 칸만 간다', () => {
    const peek = setup('가나다', { rowIndex: 0, cell: 1 });
    press('X');
    expect(bodyText(peek)).toBe('가X나다');
    expect(peek.caret).toEqual({ rowIndex: 0, cell: 2 });
  });

  it('Backspace — 앞 글자를 지우고 그 자리로 간다', () => {
    const peek = setup('가나다', { rowIndex: 0, cell: 2 });
    press('Backspace');
    expect(bodyText(peek)).toBe('가다');
    expect(peek.caret).toEqual({ rowIndex: 0, cell: 1 });
  });

  it('Delete — 커서 자리 글자를 지우고 그대로 머문다', () => {
    const peek = setup('가나다', { rowIndex: 0, cell: 1 });
    press('Delete');
    expect(bodyText(peek)).toBe('가다');
    expect(peek.caret).toEqual({ rowIndex: 0, cell: 1 });
  });

  it('접힌 줄의 두 번째 행에서 쳐도 자리를 지킨다', () => {
    // 32칸을 넘겨 두 행으로 접힌 줄. 두 번째 행 한가운데에서 친다.
    const peek = setup(`${full}가나다`, { rowIndex: 1, cell: 1 });
    press('X');
    expect(bodyText(peek)).toBe(`${full}가X나다`);
    expect(peek.caret).toEqual({ rowIndex: 1, cell: 2 });
  });
});
