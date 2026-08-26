import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FindBar from '../conversion/FindBar';
import { TABS } from '../../../types';

// 문서 안에서 찾기 — 브라우저 관습(Enter/Shift+Enter/Esc)과 점역사 관습(6점 입력).

const setup = (
  overrides: Partial<React.ComponentProps<typeof FindBar>> = {},
) => {
  const props = {
    query: '',
    onQueryChange: vi.fn(),
    scope: 'result' as const,
    onScopeChange: vi.fn(),
    brailleInput: false,
    onBrailleInputChange: vi.fn(),
    // 텍스트 점자 번역(b)은 원본(묵자)·결과(점자)가 모두 있는 모드다.
    mode: TABS.BRAILLE,
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

  // 범위 이름은 그 자리에 있는 글자로 적는다 — 원본은 늘 묵자, 결과는 모드에 따라
  // 묵자(초안 생성)이거나 점자(점자 번역)다.
  it('텍스트 점자 번역에서는 묵자·점자로 보인다', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('radio', { name: '묵자' }));
    expect(props.onScopeChange).toHaveBeenCalledWith('original');
    expect(screen.getByRole('radio', { name: '점자' })).toBeTruthy();
  });

  // 초안 생성은 원본도 결과도 묵자라, 원본 범위까지 열어 두면 "묵자 / 묵자"가 나란히
  // 떠서 무엇이 다른지 알 수 없다. 게다가 그 모드의 원본은 PDF라 찾은 자리를 못 짚는다.
  it('초안 생성에서는 결과(묵자) 하나만 남고 점자 입력이 사라진다', () => {
    setup({ mode: TABS.OCR, scope: 'result' as const });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: '묵자' })).toBeTruthy();
    expect(screen.queryByLabelText('점자로 입력')).toBeNull();
  });

  it('이미지 점자 번역에서는 결과(점자) 하나만 남는다', () => {
    setup({ mode: TABS.INTEGRATED });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: '점자' })).toBeTruthy();
    expect(screen.queryByLabelText('점자로 입력')).toBeTruthy();
  });

  // 입력 방식은 판면 격자(출력란)와 같다 — 함께 누르고 **떼는 순간** 한 글자가 들어간다.
  // 예전에는 스페이스로 확정하고 늘 끝에만 붙어, 커서를 옮겨도 소용이 없었다.
  it('점자 입력: 함께 누르고 떼면 점형 한 글자가 들어간다', () => {
    const props = setup({ scope: 'result' as const, brailleInput: true });
    const input = screen.getByLabelText('찾을 점자');

    // 1·2·4점 = ⠋ (자판 배열과 무관하게 e.code로 본다)
    fireEvent.keyDown(input, { code: 'KeyF' });
    fireEvent.keyDown(input, { code: 'KeyD' });
    fireEvent.keyDown(input, { code: 'KeyJ' });
    fireEvent.keyUp(input, { code: 'KeyF' });

    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠋');
  });

  it('점자 입력: 스페이스는 커서 자리에 빈 칸을 넣는다', () => {
    const props = setup({
      scope: 'result' as const,
      brailleInput: true,
      query: '⠋',
    });
    const input = screen.getByLabelText('찾을 점자') as HTMLInputElement;
    // 열 때 전체 선택되므로(브라우저 찾기와 같은 습관) 커서를 끝으로 옮겨 둔다.
    input.setSelectionRange(1, 1);

    fireEvent.keyDown(input, { key: ' ' });
    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠋ ');
  });

  it('점자 입력: 커서 자리에 끼워 넣는다 (끝에만 붙지 않는다)', () => {
    const props = setup({
      scope: 'result' as const,
      brailleInput: true,
      query: '⠈⠪',
    });
    const input = screen.getByLabelText('찾을 점자') as HTMLInputElement;
    input.setSelectionRange(1, 1); // 두 칸 사이

    fireEvent.keyDown(input, { code: 'KeyF' });
    fireEvent.keyUp(input, { code: 'KeyF' });

    expect(props.onQueryChange).toHaveBeenLastCalledWith('⠈⠁⠪');
  });

  it('점자 입력에서는 6점 키가 아닌 문자키를 삼킨다', () => {
    const props = setup({ scope: 'result' as const, brailleInput: true });
    // 퍼킨스 타법에서 S·D·F·J·K·L 옆의 A·G·H를 잘못 눌러도 찍히지 않아야 한다.
    fireEvent.keyDown(screen.getByLabelText('찾을 점자'), {
      key: 'g',
      code: 'KeyG',
    });
    expect(props.onQueryChange).not.toHaveBeenCalled();
  });

  // 바꾸기는 결과(출력)에만 — 원본 패널은 읽기 전용 미리보기다.
  it('바꿀 말과 두 버튼이 처음부터 보인다', async () => {
    // 초안 생성(a)의 묵자는 결과 격자라 바꾸기가 열려 있다.
    const props = setup({ query: '굴절', total: 2, mode: TABS.OCR });

    await userEvent.type(screen.getByLabelText('바꿀 말'), '굴절 지수');
    await userEvent.click(screen.getByText('바꾸기'));
    expect(props.onReplace).toHaveBeenCalled();

    await userEvent.click(screen.getByText('모두 바꾸기'));
    expect(props.onReplaceAll).toHaveBeenCalled();
  });

  // 원본은 읽기 전용이라 바꿀 수 없다. 안내 문구는 그 모드의 결과 이름으로 적는다.
  it('범위가 원본이면 바꾸기를 잠그고 결과 이름으로 안내한다', () => {
    setup({ query: '굴절', total: 2, scope: 'original', mode: TABS.BRAILLE });

    expect(screen.getByText('바꾸기').closest('button')?.disabled).toBe(true);
    expect(
      screen.getByText('원본은 바꿀 수 없습니다 — 범위를 점자로 바꿔 주세요'),
    ).toBeTruthy();
  });

  it('점자로 입력을 켜면 바꿀 말도 점형으로 찍는다', async () => {
    const props = setup({
      query: '⠈',
      total: 1,
      scope: 'result' as const,
      brailleInput: true,
    });

    const field = screen.getByLabelText('바꿀 점자');
    fireEvent.keyDown(field, { code: 'KeyF' });
    fireEvent.keyDown(field, { code: 'KeyD' });
    fireEvent.keyDown(field, { code: 'KeyJ' });
    fireEvent.keyUp(field, { code: 'KeyF' });
    expect(props.onReplacementChange).toHaveBeenLastCalledWith('⠋');
  });

  // 저장된 작업은 직전 보던 쪽 하나가 먼저 오고 나머지는 뒤에서 채워진다. 그동안
  // 건수는 부분 결과이고(12쪽짜리 실측: 한동안 첫 쪽 52건만), 그때 모두 바꾸기를
  // 누르면 안 온 쪽은 안 바뀐 채 남는다(2026-08-26 QA) — 표시하고 잠근다.
  it('쪽을 받는 중이면 알리고 모두 바꾸기만 잠근다', () => {
    setup({ query: '굴절', total: 2, mode: TABS.OCR, filling: true });

    expect(screen.getByText('쪽 불러오는 중')).toBeTruthy();
    expect(screen.getByText('모두 바꾸기').closest('button')?.disabled).toBe(
      true,
    );
    // 한 건 바꾸기는 눈에 보이는 결과에만 적용되므로 그대로 쓸 수 있다.
    expect(screen.getByText('바꾸기').closest('button')?.disabled).toBe(false);
    expect(
      screen.getByText(
        '쪽을 아직 불러오는 중입니다 — 다 오면 모두 바꾸기가 열립니다',
      ),
    ).toBeTruthy();
  });

  it('쪽이 다 오면 알림이 사라지고 모두 바꾸기가 열린다', () => {
    setup({ query: '굴절', total: 2, mode: TABS.OCR, filling: false });

    expect(screen.queryByText('쪽 불러오는 중')).toBeNull();
    expect(screen.getByText('모두 바꾸기').closest('button')?.disabled).toBe(
      false,
    );
  });

  // 펼침이 기본이지만 접을 수는 있어야 한다(2026-08-26 QA로 기본값만 뒤집었다).
  it('접기 단추로 바꾸기 줄을 숨길 수 있다', async () => {
    setup({ query: '굴절', total: 2 });
    expect(screen.queryByLabelText('바꿀 말')).toBeTruthy();

    await userEvent.click(screen.getByLabelText('바꾸기 접기'));

    expect(screen.queryByLabelText('바꿀 말')).toBeNull();
  });
});
