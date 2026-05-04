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
    expect(screen.getByText(/추천할 대체 텍스트가 없습니다/)).toBeInTheDocument();
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
    expect(onSelect).toHaveBeenCalledWith('y');
    expect(onClose).toHaveBeenCalled();
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
