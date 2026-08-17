import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CandidateModal from '../conversion/CandidateModal';
import { TABS } from '../../../types';

// 기획 정본("모눈종이 뷰" S4·S5): 안을 목록으로 늘어놓지 않고 방식을 탭으로 세워
// 한 안을 크게 보여 준다. 점역·통합은 묵자 + 점자 미리보기, OCR은 묵자만.

const drafts = [
  { label: '격자형', printText: '매질 굴절률', content: '⠈⠪⠐⠕\n⠋⠕⠣' },
  { label: '행↔열 전치', printText: '굴절률 매질', content: '⠠⠍' },
];

describe('CandidateModal', () => {
  it('isOpen이 false면 아무것도 그리지 않는다', () => {
    const { container } = render(
      <CandidateModal
        isOpen={false}
        onClose={vi.fn()}
        candidates={['a', 'b']}
        currentText="a"
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('방식마다 탭이 하나씩 서고, 지금 쓰는 안의 탭부터 열린다', () => {
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        drafts={drafts}
        mode={TABS.BRAILLE}
        currentText="⠠⠍"
        onSelect={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    // 두 번째 안이 지금 쓰는 안 — 열자마자 그 탭이 선택돼 있다.
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].textContent).toContain('●');
    expect(screen.getByText('굴절률 매질')).toBeInTheDocument();
  });

  it('점역 모드는 묵자와 점자를 함께 보여 준다', () => {
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        drafts={drafts}
        mode={TABS.INTEGRATED}
        currentText=""
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('묵자')).toBeInTheDocument();
    expect(screen.getByText('점자')).toBeInTheDocument();
    expect(screen.getByText('매질 굴절률')).toBeInTheDocument();
  });

  it('OCR 모드는 묵자(텍스트)만 보여 준다 — 점자 미리보기 없음', () => {
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        drafts={[{ label: '격자형', content: '매질 굴절률' }]}
        mode={TABS.OCR}
        currentText=""
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('텍스트')).toBeInTheDocument();
    expect(screen.queryByText('점자')).toBeNull();
    expect(screen.getByText('매질 굴절률')).toBeInTheDocument();
  });

  it('탭을 바꾸고 [이 안 사용]을 누르면 그 안이 적용된다', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CandidateModal
        isOpen
        onClose={onClose}
        candidates={[]}
        drafts={drafts}
        mode={TABS.BRAILLE}
        currentText=""
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /행↔열 전치/ }));
    await userEvent.click(screen.getByRole('button', { name: '이 안 사용' }));

    expect(onSelect).toHaveBeenCalledWith('⠠⠍', 1);
    expect(onClose).toHaveBeenCalled();
  });

  it('이미 쓰고 있는 안은 다시 적용할 수 없다', () => {
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        drafts={drafts}
        mode={TABS.BRAILLE}
        currentText="⠠⠍"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '이 안 사용' })).toBeDisabled();
  });

  it('손으로 고친 블록이면 편집이 사라진다고 한 번 확인한다', async () => {
    const onSelect = vi.fn();
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        drafts={drafts}
        mode={TABS.BRAILLE}
        currentText=""
        isEdited
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '이 안 사용' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/편집 내용이 사라집니다/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '그래도 적용' }));
    expect(onSelect).toHaveBeenCalledWith('⠈⠪⠐⠕\n⠋⠕⠣', 0);
  });

  it('drafts가 없으면 문자열 후보를 그대로 탭으로 세운다', async () => {
    const onSelect = vi.fn();
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={['hello', 'world']}
        currentText=""
        onSelect={onSelect}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await userEvent.click(screen.getByRole('tab', { name: '2번 안' }));
    await userEvent.click(screen.getByRole('button', { name: '이 안 사용' }));
    expect(onSelect).toHaveBeenCalledWith('world', 1);
  });

  it('후보가 없으면 안내만 보여 준다', () => {
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        currentText=""
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/추천할 대체 텍스트가 없습니다/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});
