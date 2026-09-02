import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TypesetSettings from '../conversion/TypesetSettings';
import {
  DEFAULT_TYPESET,
  type TypesetOptions,
} from '../../../utils/typesetOptions';

// 2026-09-01 설계 — 용어를 "페이지"로 통일하고, 값이 찍히는 자리를 라벨에 적는다.
// 옛 화면은 같은 개념을 면·쪽·페이지 세 가지로 불렀다.

const setup = (over: Partial<TypesetOptions> = {}) => {
  const onChange = vi.fn();
  const value = { ...DEFAULT_TYPESET, ...over };
  render(<TypesetSettings value={value} onChange={onChange} />);
  return { onChange, value };
};

describe('조판 설정 패널', () => {
  it('페이지행을 끄면 그 안의 항목이 숨는다', async () => {
    const { onChange } = setup();
    // 켜져 있을 때는 보인다.
    expect(screen.getByText('넣을 페이지')).toBeTruthy();
    await userEvent.click(screen.getByRole('switch', { name: '페이지행' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageRowOn: 'none' }),
    );
  });

  it('페이지행이 꺼져 있으면 넣을 페이지·함께 넣을 번호가 없다', () => {
    setup({ pageRowOn: 'none' });
    expect(screen.queryByText('넣을 페이지')).toBeNull();
    expect(screen.queryByText('함께 넣을 번호')).toBeNull();
  });

  it('다시 켜면 지침 기본값인 홀수 페이지로 돌아온다', async () => {
    const { onChange } = setup({ pageRowOn: 'none' });
    await userEvent.click(screen.getByRole('switch', { name: '페이지행' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageRowOn: 'odd' }),
    );
  });

  it('원본 페이지 번호를 끄면 변경선도 함께 꺼진다', async () => {
    // 변경선에 적을 번호가 없어지기 때문이다.
    const { onChange } = setup({ showOrigPage: true, showChangeLine: true });
    await userEvent.click(
      screen.getByRole('checkbox', { name: '원본 페이지 번호 (왼쪽)' }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showOrigPage: false, showChangeLine: false }),
    );
  });

  // 2026-09-02 braille-assist 갱신으로 Options.showChangeLine이 생겨 열렸다.
  it('변경선 스위치를 끄면 showChangeLine이 꺼진다', async () => {
    const onChange = vi.fn();
    render(<TypesetSettings value={DEFAULT_TYPESET} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: '원본 페이지 변경선' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showChangeLine: false }),
    );
  });

  it('원본 페이지 번호가 꺼져 있으면 변경선은 켤 수 없다', async () => {
    const onChange = vi.fn();
    render(
      <TypesetSettings
        value={{ ...DEFAULT_TYPESET, showOrigPage: false, showChangeLine: false }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('switch', { name: '원본 페이지 변경선' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('규격이 32칸 26줄이 아니면 눈에 띄게 알린다', () => {
    setup({ cols: 40, rows: 20 });
    expect(screen.getByText(/한국 점자 도서 규격/)).toBeTruthy();
  });

  // 우측 정렬도 2026-09-02 갱신으로 라이브러리에 들어왔다 — 더 이상 경고가 아니다.
  it('오른쪽 정렬을 고르면 어디가 오른쪽 끝인지 알린다', () => {
    setup({ footerAlign: 'right' });
    expect(screen.getByText(/두 칸 띄운 자리가 오른쪽 끝/)).toBeTruthy();
  });

  it('꼬리말이 페이지행에 안 들어갈 것 같으면 미리 경고한다', () => {
    setup({ footerText: '아주 긴 꼬리말을 넣어 봅니다 정말 아주 길게 넣습니다' });
    expect(screen.getByText(/잘릴 수 있습니다/)).toBeTruthy();
  });

  it('용어를 페이지로 통일한다 — 면·쪽이 라벨에 남지 않는다', () => {
    const { container } = render(
      <TypesetSettings value={DEFAULT_TYPESET} onChange={vi.fn()} />,
    );
    const labels = [...container.querySelectorAll('span,p')]
      .map((n) => n.textContent ?? '')
      .join(' ');
    expect(labels).not.toMatch(/홀수 면|모든 면|점자 면 번호|원본 쪽 번호/);
    expect(labels).toContain('원본 페이지 번호');
    expect(labels).toContain('점자 페이지 번호');
  });
});
