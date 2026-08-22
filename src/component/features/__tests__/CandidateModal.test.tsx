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

  // 표·그림 대체 텍스트는 4줄을 넘는 일이 잦은데 앞 4줄만 그려서 뒷부분을 볼 방법이
  // 없었다(2026-08-20 QA). 이제 전부 그리고 상자가 스크롤한다.
  it('긴 점자도 자르지 않고 모두 그린다 (상자가 스크롤)', () => {
    const long = Array.from({ length: 12 }, (_, i) => `⠁⠃${i}`).join('\n');
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        drafts={[{ label: '격자형', printText: '긴 표', content: long }]}
        mode={TABS.BRAILLE}
        currentText=""
        onSelect={vi.fn()}
      />,
    );

    // 묵자 칸도 스크롤 상자라, 점자 쪽만 집어 본다.
    const box = screen
      .getByText('점자')
      .parentElement?.querySelector('.overflow-auto');
    expect(box).toBeTruthy();
    // 12줄이 그대로 살아 있다(각 줄은 32칸짜리 한 덩어리).
    expect(box?.querySelectorAll('.flex').length).toBe(12);
  });

  // 기능정의서 "대체 초안 / 후보 선택" 3항·D-2: 근거 없는 선택지를 주지 않는다 —
  // 시각 요소 설명(점역자 주)과 적용 규정을 후보와 함께 보여 준다.
  it('시각 요소 설명과 적용 규정을 함께 보여 준다', () => {
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        drafts={drafts}
        mode={TABS.BRAILLE}
        currentText=""
        tnText="막대그래프. 가로축은 연도, 세로축은 판매량."
        ruleTrail={[
          {
            rule_id: '§2.2',
            source: '한국점자규정',
            section: '제2장',
            title: '수의 표기',
            excerpt: '숫자 앞에는 수표를 적는다.',
            priority: 'primary',
          },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('시각 요소 설명 (점역자 주)')).toBeInTheDocument();
    expect(
      screen.getByText('막대그래프. 가로축은 연도, 세로축은 판매량.'),
    ).toBeInTheDocument();
    expect(screen.getByText('적용 규정')).toBeInTheDocument();
    expect(screen.getByText('제2장 수의 표기')).toBeInTheDocument();
    expect(screen.getByText('숫자 앞에는 수표를 적는다.')).toBeInTheDocument();
  });

  it('근거가 없으면 그 자리를 아예 두지 않는다', () => {
    render(
      <CandidateModal
        isOpen
        onClose={vi.fn()}
        candidates={[]}
        drafts={drafts}
        mode={TABS.BRAILLE}
        currentText=""
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText('적용 규정')).toBeNull();
    expect(screen.queryByText('시각 요소 설명 (점역자 주)')).toBeNull();
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
