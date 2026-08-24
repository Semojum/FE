import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FindBar from '../conversion/FindBar';

// 문서 안에서 찾기 — 브라우저 관습(Enter/Shift+Enter/Esc)과 점역사 관습(6점 입력).

const setup = (
  overrides: Partial<React.ComponentProps<typeof FindBar>> = {},
) => {
  const props = {
    query: '',
    onQueryChange: vi.fn(),
    scope: 'all' as const,
    onScopeChange: vi.fn(),
    brailleInput: false,
    onBrailleInputChange: vi.fn(),
    total: 0,
    current: 0,
    onStep: vi.fn(),
    onClose: vi.fn(),
    replacement: '',
    onReplacementChange: vi.fn(),
    onReplace: vi.fn(),
    onReplaceAll: vi.fn(),
    ...overrides,
  };
  render(<FindBar {...props} />);
  return props;
};

describe('FindBar', () => {
  it('Enter는 다음, Shift+Enter는 이전으로 간다', async () => {
    const props = setup({ query: '굴절', total: 3, current: 0 });
    const input = screen.getByLabelText('찾을 말');

    await userEvent.type(input, '{Enter}');
    expect(props.onStep).toHaveBeenLastCalledWith(1);

    await userEvent.type(input, '{Shift>}{Enter}{/Shift}');
    expect(props.onStep).toHaveBeenLastCalledWith(-1);
  });

  it('Esc로 닫는다', async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText('찾을 말'), '{Escape}');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('몇 번째/몇 건인지 보여 준다', () => {
    setup({ query: '굴절', total: 3, current: 1 });
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('범위를 고를 수 있다', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('radio', { name: '원본만' }));
    expect(props.onScopeChange).toHaveBeenCalledWith('original');
  });

  // 입력 방식은 판면 격자(출력란)와 같다 — 함께 누르고 **떼는 순간** 한 글자가 들어간다.
  // 예전에는 스페이스로 확정하고 늘 끝에만 붙어, 커서를 옮겨도 소용이 없었다.
  it('점자 입력: 함께 누르고 떼면 점형 한 글자가 들어간다', () => {
    const props = setup({ brailleInput: true });
    const input = screen.getByLabelText('찾을 점자');

    // 1·2·4점 = ⠋ (자판 배열과 무관하게 e.code로 본다)
    fireEvent.keyDown(input, { code: 'KeyF' });
    fireEvent.keyDown(input, { code: 'KeyD' });
    fireEvent.keyDown(input, { code: 'KeyJ' });
    fireEvent.keyUp(input, { code: 'KeyF' });

    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠋');
  });

  it('점자 입력: 스페이스는 커서 자리에 빈 칸을 넣는다', () => {
    const props = setup({ brailleInput: true, query: '⠋' });
    const input = screen.getByLabelText('찾을 점자') as HTMLInputElement;
    // 열 때 전체 선택되므로(브라우저 찾기와 같은 습관) 커서를 끝으로 옮겨 둔다.
    input.setSelectionRange(1, 1);

    fireEvent.keyDown(input, { key: ' ' });
    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠋ ');
  });

  it('점자 입력: 커서 자리에 끼워 넣는다 (끝에만 붙지 않는다)', () => {
    const props = setup({ brailleInput: true, query: '⠈⠪' });
    const input = screen.getByLabelText('찾을 점자') as HTMLInputElement;
    input.setSelectionRange(1, 1); // 두 칸 사이

    fireEvent.keyDown(input, { code: 'KeyF' });
    fireEvent.keyUp(input, { code: 'KeyF' });

    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠈⠁⠪');
  });

  it('점자 입력에서는 6점 키가 아닌 문자키를 삼킨다', () => {
    const props = setup({ brailleInput: true });
    // 퍼킨스 타법에서 S·D·F·J·K·L 옆의 A·G·H를 잘못 눌러도 찍히지 않아야 한다.
    fireEvent.keyDown(screen.getByLabelText('찾을 점자'), {
      key: 'g',
      code: 'KeyG',
    });
    expect(props.onQueryChange).not.toHaveBeenCalled();
  });

  // 바꾸기는 결과(출력)에만 — 원본 패널은 읽기 전용 미리보기다.
  it('바꾸기를 펼치면 바꿀 말과 두 버튼이 나온다', async () => {
    const props = setup({ query: '굴절', total: 2 });
    await userEvent.click(screen.getByLabelText('바꾸기 펼치기'));

    await userEvent.type(screen.getByLabelText('바꿀 말'), '굴절 지수');
    await userEvent.click(screen.getByText('바꾸기'));
    expect(props.onReplace).toHaveBeenCalled();

    await userEvent.click(screen.getByText('모두 바꾸기'));
    expect(props.onReplaceAll).toHaveBeenCalled();
  });

  it('범위가 원본만이면 바꾸기를 잠근다', async () => {
    setup({ query: '굴절', total: 2, scope: 'original' });
    await userEvent.click(screen.getByLabelText('바꾸기 펼치기'));

    expect(screen.getByText('바꾸기').closest('button')?.disabled).toBe(true);
    expect(
      screen.getByText('원본은 바꿀 수 없습니다 — 범위를 결과로 바꿔 주세요'),
    ).toBeTruthy();
  });

  it('점자로 입력을 켜면 바꿀 말도 점형으로 찍는다', async () => {
    const props = setup({ query: '⠈', total: 1, brailleInput: true });
    await userEvent.click(screen.getByLabelText('바꾸기 펼치기'));

    const field = screen.getByLabelText('바꿀 점자');
    fireEvent.keyDown(field, { code: 'KeyF' });
    fireEvent.keyDown(field, { code: 'KeyD' });
    fireEvent.keyDown(field, { code: 'KeyJ' });
    fireEvent.keyUp(field, { code: 'KeyF' });
    expect(props.onReplacementChange).toHaveBeenLastCalledWith('⠋');
  });
});
