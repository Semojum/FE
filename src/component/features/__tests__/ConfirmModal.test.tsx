import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from '../../shared/ConfirmModal';

// window.confirm은 데스크톱 웹뷰(Tauri)에서 뜨지 않는다 — "취소를 눌렀는데 아무것도
// 안 뜨고 아무 일도 없다"가 됐다(2026-08-24 QA). 앱 모달로 물어야 두 환경에서 같다.

describe('ConfirmModal', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    const { container } = render(
      <ConfirmModal
        isOpen={false}
        title="변환을 중단할까요?"
        message="진행 중입니다."
        confirmLabel="중단"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('확인을 누르면 그 동작만 실행한다', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmModal
        isOpen
        title="변환을 중단할까요?"
        message={'변환이 아직 진행 중입니다.\n지금 비우면 중단합니다.'}
        confirmLabel="중단하고 비우기"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('변환을 중단할까요?')).toBeTruthy();
    await userEvent.click(screen.getByText('중단하고 비우기'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('취소를 누르면 닫기만 한다', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmModal
        isOpen
        title="완전히 삭제할까요?"
        message="복구할 수 없습니다."
        confirmLabel="완전 삭제"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    await userEvent.click(screen.getByText('취소'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
