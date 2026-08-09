import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ContextMenu from '../../shared/ContextMenu';

// 격자 우클릭은 커서를 옮기면서 스크롤을 부를 수 있다. 그 스크롤에 메뉴가 닫히면
// 사용자에게는 "블록 추가·삭제가 아예 안 되는" 것으로 보인다 (QA 2026-08-09).

const items = [{ label: '블록 추가', onSelect: () => undefined }];

afterEach(() => vi.useRealTimers());

describe('ContextMenu', () => {
  it('열린 직후의 스크롤에는 닫히지 않는다', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('잠시 뒤의 스크롤에는 닫힌다', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(500);
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('바깥을 누르면 닫힌다', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);

    act(() => {
      window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
