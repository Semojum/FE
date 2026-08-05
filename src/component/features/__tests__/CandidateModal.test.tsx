import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CandidateModal from '../conversion/CandidateModal';

describe('CandidateModal', () => {
  it('renders nothing when isOpen is false', () => {
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

  it('lists each candidate as a button', () => {
    render(
      <CandidateModal
        isOpen={true}
        onClose={vi.fn()}
        candidates={['hello', 'world']}
        currentText=""
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('shows empty message when no candidates', () => {
    render(
      <CandidateModal
        isOpen={true}
        onClose={vi.fn()}
        candidates={[]}
        currentText=""
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/추천할 대체 텍스트가 없습니다/),
    ).toBeInTheDocument();
  });

  it('clicking a candidate fires onSelect and onClose', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CandidateModal
        isOpen={true}
        onClose={onClose}
        candidates={['x', 'y']}
        currentText=""
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByText('y'));
    // 두 번째 후보(idx 1)를 고른다.
    expect(onSelect).toHaveBeenCalledWith('y', 1);
    expect(onClose).toHaveBeenCalled();
  });

  it('이미 채택된 후보를 다시 누르면 원본으로 스와프한다 (idx -1)', async () => {
    const onSelect = vi.fn();
    render(
      <CandidateModal
        isOpen={true}
        onClose={vi.fn()}
        candidates={['x', 'y']}
        currentText="y"
        originalText="원본"
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByText('y'));
    expect(onSelect).toHaveBeenCalledWith('원본', -1);
  });

  it('marks the currentText as selected', () => {
    render(
      <CandidateModal
        isOpen={true}
        onClose={vi.fn()}
        candidates={['a', 'b']}
        currentText="a"
        onSelect={vi.fn()}
      />,
    );
    // The "a" entry should have a check icon (Check from lucide renders an svg)
    const aBtn = screen.getByText('a').closest('button');
    expect(aBtn?.querySelector('svg')).toBeTruthy();
  });
});
