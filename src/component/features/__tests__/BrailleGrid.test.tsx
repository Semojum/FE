import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrailleGrid, { GridCaret } from '../conversion/BrailleGrid';
import { buildLayout } from '../../../utils/brailleLayout';
import { ConversionTab, TABS, TranslationBlock } from '../../../types';

// 격자 편집 — 점자 모드에서 묵자가 섞여 들어가던 문제(QA 2026-08-09)와
// 우클릭 메뉴 호출 경로를 지킨다.

const blocks: Record<number, TranslationBlock[]> = {
  1: [
    { id: 'b1', currentText: '⠫⠎⠣⠝', candidates: [] },
    { id: 'b2', currentText: '둘째 줄', candidates: [] },
  ],
};

interface HarnessProps {
  mode: ConversionTab;
  onEditRow: (rowIndex: number, text: string) => void;
  onContextMenu?: (rowIndex: number, x: number, y: number) => void;
}

const Harness: React.FC<HarnessProps> = ({
  mode,
  onEditRow,
  onContextMenu = () => undefined,
}) => {
  const [caret, setCaret] = useState<GridCaret | null>(null);
  return (
    <BrailleGrid
      pages={buildLayout(blocks, false)}
      mode={mode}
      caret={caret}
      highlightBlockId={null}
      onCaretChange={setCaret}
      onEditRow={onEditRow}
      onContextMenu={onContextMenu}
    />
  );
};

const clickFirstCell = async (user: ReturnType<typeof userEvent.setup>) => {
  const cells = screen.getAllByRole('gridcell');
  await user.click(cells[0]);
  return cells;
};

describe('BrailleGrid', () => {
  it('셀을 클릭하면 숨은 입력창으로 포커스가 간다', async () => {
    const user = userEvent.setup();
    render(<Harness mode={TABS.OCR} onEditRow={() => undefined} />);
    await clickFirstCell(user);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      '점자 판면 편집',
    );
  });

  it('묵자 모드에서는 문자 키가 그대로 칸에 들어간다', async () => {
    const onEditRow = vi.fn();
    const user = userEvent.setup();
    render(<Harness mode={TABS.OCR} onEditRow={onEditRow} />);
    await clickFirstCell(user);

    await user.keyboard('X');
    expect(onEditRow).toHaveBeenCalledTimes(1);
    expect(onEditRow.mock.calls[0][1]).toContain('X');
  });

  it('점자 모드에서는 6점 키가 아닌 문자 키를 무시한다', async () => {
    const onEditRow = vi.fn();
    const user = userEvent.setup();
    render(<Harness mode={TABS.INTEGRATED} onEditRow={onEditRow} />);
    await clickFirstCell(user);

    // S·D·F·J·K·L 주변의 오타 키들 — 예전에는 그대로 영문자가 찍혔다.
    await user.keyboard('agh;');
    expect(onEditRow).not.toHaveBeenCalled();
  });

  it('점자 모드에서도 빈 칸(스페이스)은 넣을 수 있다', async () => {
    const onEditRow = vi.fn();
    const user = userEvent.setup();
    render(<Harness mode={TABS.BRAILLE} onEditRow={onEditRow} />);
    await clickFirstCell(user);

    await user.keyboard(' ');
    expect(onEditRow).toHaveBeenCalledTimes(1);
  });

  it('점자 모드에서 6점 키를 떼면 점형 한 글자가 들어간다', async () => {
    const onEditRow = vi.fn();
    const user = userEvent.setup();
    render(<Harness mode={TABS.BRAILLE} onEditRow={onEditRow} />);
    await clickFirstCell(user);

    // F(1점) + D(2점) 동시 입력 → ⠃
    await user.keyboard('{f>}{d>}{/f}{/d}');
    expect(onEditRow).toHaveBeenCalled();
    expect(onEditRow.mock.calls[0][1]).toContain('⠃');
  });

  it('본문 행을 우클릭하면 메뉴 위치를 알려 준다', async () => {
    const onContextMenu = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        mode={TABS.OCR}
        onEditRow={() => undefined}
        onContextMenu={onContextMenu}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    await user.pointer({ keys: '[MouseRight]', target: cells[0] });
    expect(onContextMenu).toHaveBeenCalled();
    expect(onContextMenu.mock.calls[0][0]).toBe(0);
  });
});
