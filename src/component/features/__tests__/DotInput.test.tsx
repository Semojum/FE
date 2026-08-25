import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DotInput from '../conversion/DotInput';

// 찾기·바꾸기 입력칸의 점자 모드.
//
// 한/영 상태가 한글이면 IME가 keydown을 가로채므로 문자키 차단이 통하지 않는다.
// 조합 결과가 그대로 값에 들어와 점자와 한글이 섞여 나왔다(2026-08-25 QA).
// 판면 격자는 조합 이벤트에서 같은 이유로 일찍 빠져나온다 — 여기도 같게 맞춘다.

const setup = (brailleInput: boolean, value = '') => {
  const onChange = vi.fn();
  render(
    <DotInput
      value={value}
      onChange={onChange}
      brailleInput={brailleInput}
      label="바꿀 말"
      placeholder=""
    />,
  );
  return {
    onChange,
    input: screen.getByLabelText('바꿀 말') as HTMLInputElement,
  };
};

describe('DotInput · 점자 모드에서 한글 IME 차단', () => {
  it('조합으로 들어온 한글은 걸러 내고 점형만 남긴다', () => {
    const { onChange, input } = setup(true, '⠁');

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '⠁가' } });

    expect(onChange).toHaveBeenLastCalledWith('⠁');
  });

  it('조합이 끝난 뒤에도 남은 한글을 되돌린다', () => {
    const { onChange, input } = setup(true, '⠁');

    fireEvent.compositionStart(input);
    input.value = '⠁각';
    fireEvent.compositionEnd(input, { data: '각' });

    expect(input.value).toBe('⠁');
    expect(onChange).toHaveBeenLastCalledWith('⠁');
  });

  it('빈 칸은 점자 모드에서도 받는다', () => {
    const { onChange, input } = setup(true, '⠁');

    fireEvent.change(input, { target: { value: '⠁ ⠃' } });

    expect(onChange).toHaveBeenLastCalledWith('⠁ ⠃');
  });

  it('점자 모드가 아니면 한글을 그대로 받는다', () => {
    const { onChange, input } = setup(false);

    fireEvent.change(input, { target: { value: '가나' } });

    expect(onChange).toHaveBeenLastCalledWith('가나');
  });
});
