import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConversionSettingsModal from '../conversion/ConversionSettingsModal';

// 쪽번호·꼬리말은 업로드 시점에 확정된다. 드롭존 안에 붙여 두면 파일을 올리기 전에
// 눈에 띄지 않아 지나치기 쉬워, 파일을 고른 직후 이 모달로 물어본다 (Figma V3-02).

const setup = (
  props: Partial<React.ComponentProps<typeof ConversionSettingsModal>> = {},
) => {
  const onStart = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConversionSettingsModal
      isOpen
      fileName="수학.hwp"
      onCancel={onCancel}
      onStart={onStart}
      {...props}
    />,
  );
  return { onStart, onCancel };
};

describe('ConversionSettingsModal', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    setup({ isOpen: false });
    expect(screen.queryByText('변환 설정')).toBeNull();
  });

  it('고른 파일 이름을 보여준다', () => {
    setup();
    expect(screen.getByText('수학.hwp')).toBeTruthy();
  });

  it('기본값은 페이지행 없음 · 꼬리말 빈 값이다', async () => {
    const user = userEvent.setup();
    const { onStart } = setup();
    await user.click(screen.getByRole('button', { name: '변환 시작' }));
    expect(onStart).toHaveBeenCalledWith(false, '');
  });

  it('정한 값을 그대로 넘긴다', async () => {
    const user = userEvent.setup();
    const { onStart } = setup();
    await user.click(screen.getByRole('checkbox'));
    await user.type(
      screen.getByPlaceholderText('예: 수학 익힘책 1'),
      '  수학 익힘책 1  ',
    );
    await user.click(screen.getByRole('button', { name: '변환 시작' }));
    // 앞뒤 공백은 떼고 넘긴다 — 페이지행 가운데에 그대로 점역되는 값이다.
    expect(onStart).toHaveBeenCalledWith(true, '수학 익힘책 1');
  });

  it('취소하면 시작하지 않는다', async () => {
    const user = userEvent.setup();
    const { onStart, onCancel } = setup();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('꼬리말은 200자까지만 받는다', () => {
    setup();
    const input = screen.getByPlaceholderText(
      '예: 수학 익힘책 1',
    ) as HTMLInputElement;
    expect(input.maxLength).toBe(200);
  });
});
