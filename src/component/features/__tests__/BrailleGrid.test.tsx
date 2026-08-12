import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

  // 숨은 input을 value=''로 고정한 제어 컴포넌트로 두면 조합 중 값이 매 렌더마다
  // 지워져 한글만 입력되지 않았다 (QA "mode a 우측에서 영어는 입력 가능하나 한글 입력 안됨").
  it('묵자 모드에서 IME 조합으로 확정된 한글이 칸에 들어간다', async () => {
    const onEditRow = vi.fn();
    const user = userEvent.setup();
    render(<Harness mode={TABS.OCR} onEditRow={onEditRow} />);
    await clickFirstCell(user);

    const input = document.activeElement as HTMLInputElement;
    fireEvent.compositionStart(input);
    // happy-dom의 CompositionEvent는 data를 담지 않아 직접 실어 보낸다.
    const end = new Event('compositionend', { bubbles: true });
    Object.defineProperty(end, 'data', { value: '가' });
    // 조합 중 webview가 input에 채워 둔 값 — 확정 뒤 비워져야 한다.
    input.value = '가';
    fireEvent(input, end);

    expect(onEditRow).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
    expect(onEditRow.mock.calls[0][1]).toContain('가');
  });

  // 점역자주 태그는 본문에 남기되(다운로드 파일과 어긋나면 안 된다) 흐리게 그린다.
  it('점역자주 태그 칸은 회색으로 그린다', () => {
    const tagged: Record<number, TranslationBlock[]> = {
      1: [
        {
          id: 'b1',
          currentText: '<!점역자주>그림<!/점역자주>',
          candidates: [],
        },
      ],
    };
    render(
      <BrailleGrid
        pages={buildLayout(tagged, false)}
        mode={TABS.OCR}
        caret={null}
        highlightBlockId={null}
        onCaretChange={() => undefined}
        onEditRow={() => undefined}
        onContextMenu={() => undefined}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    const dim = 'text-[#c8ccd4]';
    // "<!점역자주>" 7칸 → 흐림, 이어지는 "그림" 2칸 → 본문 색 그대로
    expect(cells[0].className).toContain(dim);
    expect(cells[6].className).toContain(dim);
    expect(cells[7].className).not.toContain(dim);
    expect(cells[8].className).not.toContain(dim);
    // 닫는 태그 "<!/점역자주>" 8칸도 흐림
    expect(cells[9].className).toContain(dim);
    expect(cells[16].className).toContain(dim);
  });
});
