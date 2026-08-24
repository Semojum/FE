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

  // 로컬에 묵자→점자 번역기가 없어 점형을 직접 찍는다.
  it('점자 입력: F D J로 점을 찍고 스페이스로 한 칸 확정한다', async () => {
    const props = setup({ brailleInput: true });
    const input = screen.getByLabelText('찾을 점자');

    // 1·2·4점 = ⠋
    await userEvent.type(input, 'fdj ');
    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠋');
  });

  it('점자 입력: 같은 키를 다시 누르면 그 점이 지워진다', async () => {
    const props = setup({ brailleInput: true });
    const input = screen.getByLabelText('찾을 점자');

    // f(1점) → f(취소) → d(2점) → 확정 = ⠂
    await userEvent.type(input, 'ffd ');
    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠂');
  });

  // 점역 타자는 여섯 손가락을 화음처럼 거의 동시에 누른다 — 같은 틱에 들어와도
  // 점이 서로를 덮어쓰면 안 된다(상태 대신 ref로 들고 있는 이유).
  it('점을 한꺼번에 눌러도(같은 틱) 다 모인다', () => {
    const props = setup({ brailleInput: true });
    const input = screen.getByLabelText('찾을 점자');

    fireEvent.keyDown(input, { key: 'f' });
    fireEvent.keyDown(input, { key: 'd' });
    fireEvent.keyDown(input, { key: 'j' });
    fireEvent.keyDown(input, { key: ' ' });

    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠋');
  });

  it('점자 입력에서는 일반 글자가 들어가지 않는다', async () => {
    const props = setup({ brailleInput: true });
    await userEvent.type(screen.getByLabelText('찾을 점자'), 'g');
    expect(props.onQueryChange).not.toHaveBeenCalled();
  });
});
