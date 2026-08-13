import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrailleGrid, { GridCaret } from '../conversion/BrailleGrid';
import { buildLayout, CELLS_PER_ROW } from '../../../utils/brailleLayout';
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

  // <!…> 표식은 표식 자체만 흐리게 그린다. 안쪽 내용은 본문이라 그대로 둔다.
  // 모드를 가리지 않는다 — 본문에 이 모양이 실려 오면 어느 모드든 흐려진다.
  it.each([TABS.OCR, TABS.BRAILLE, TABS.INTEGRATED])(
    '%s 모드에서 <!…> 표식만 회색으로 그린다',
    (mode) => {
      const tagged: Record<number, TranslationBlock[]> = {
        1: [
          {
            id: 'b1',
            currentText: '본문<!점역자주>그림<!/점역자주>끝',
            candidates: [],
          },
        ],
      };
      render(
        <BrailleGrid
          pages={buildLayout(tagged, false)}
          mode={mode}
          caret={null}
          highlightBlockId={null}
          onCaretChange={() => undefined}
          onEditRow={() => undefined}
          onContextMenu={() => undefined}
        />,
      );
      const cells = screen.getAllByRole('gridcell');
      const dim = 'text-[#c8ccd4]';
      // "본문"(0~1) → 그대로
      expect(cells[0].className).not.toContain(dim);
      expect(cells[1].className).not.toContain(dim);
      // "<!점역자주>" 7칸(2~8) → 흐림
      expect(cells[2].className).toContain(dim);
      expect(cells[8].className).toContain(dim);
      // 안쪽 "그림"(9~10) → 본문이므로 그대로
      expect(cells[9].className).not.toContain(dim);
      expect(cells[10].className).not.toContain(dim);
      // "<!/점역자주>" 8칸(11~18) → 흐림
      expect(cells[11].className).toContain(dim);
      expect(cells[18].className).toContain(dim);
      // "끝"(19) → 그대로
      expect(cells[19].className).not.toContain(dim);
      // 바꾸는 것은 글자색뿐 — 칸 배경은 그대로다
      expect(cells[2].className).toContain('bg-white');
    },
  );

  // 판면을 어지럽혀 뺐다 — 대체 텍스트 유무는 결과 패널 위 버튼이 알려 준다.
  it('대체 텍스트가 있어도 줄번호 옆에 점을 찍지 않는다', () => {
    const withDrafts: Record<number, TranslationBlock[]> = {
      1: [
        {
          id: 'b1',
          currentText: '본문',
          candidates: ['다른 표현'],
          drafts: [{ content: '다른 표현' }],
        },
      ],
    };
    const { container } = render(
      <BrailleGrid
        pages={buildLayout(withDrafts, false)}
        mode={TABS.OCR}
        caret={null}
        highlightBlockId={null}
        onCaretChange={() => undefined}
        onEditRow={() => undefined}
        onContextMenu={() => undefined}
      />,
    );
    expect(container.textContent).not.toContain('•');
    expect(screen.queryByLabelText('대체 초안 있음')).toBeNull();
  });

  // 원본 패널의 블록 hover와 같이, 마우스를 얹은 블록을 상자로 감싼다.
  it('마우스를 얹은 블록만 상자로 감싼다', () => {
    const two: Record<number, TranslationBlock[]> = {
      1: [
        { id: 'b1', currentText: '첫블록', candidates: [] },
        { id: 'b2', currentText: '둘째블록', candidates: [] },
      ],
    };
    render(
      <BrailleGrid
        pages={buildLayout(two, false)}
        mode={TABS.OCR}
        caret={null}
        highlightBlockId={null}
        onCaretChange={() => undefined}
        onEditRow={() => undefined}
        onContextMenu={() => undefined}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    const rowOf = (cellIdx: number) => cells[cellIdx].parentElement!;
    const hoverBox = 'border-[#c3cfdd]';

    expect(rowOf(0).className).not.toContain(hoverBox);

    fireEvent.mouseOver(cells[0]);
    expect(rowOf(0).className).toContain(hoverBox);
    // 다른 블록(둘째 줄)은 그대로
    expect(rowOf(CELLS_PER_ROW).className).not.toContain(hoverBox);
  });

  // 종류를 가리지 않는다 — 점역자주가 아닌 표식도 같은 규칙이다.
  it('점역자주가 아닌 <!…> 표식도 흐리게 그린다', () => {
    const tagged: Record<number, TranslationBlock[]> = {
      1: [{ id: 'b1', currentText: '앞<!표>뒤', candidates: [] }],
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
    expect(cells[0].className).not.toContain(dim); // "앞"
    for (const i of [1, 2, 3, 4]) {
      expect(cells[i].className, `cell ${i}`).toContain(dim); // "<!표>"
    }
    expect(cells[5].className).not.toContain(dim); // "뒤"
  });

  // 닫는 >가 없으면 표식이 아니다 — 우연히 나온 "<!"에 판면이 통째로 회색이 되면 안 된다.
  it('닫히지 않은 <! 는 표식으로 보지 않는다', () => {
    const tagged: Record<number, TranslationBlock[]> = {
      1: [{ id: 'b1', currentText: '앞<!뒤', candidates: [] }],
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
    for (const i of [0, 1, 2, 3]) {
      expect(cells[i].className, `cell ${i}`).not.toContain(dim);
    }
  });
});
