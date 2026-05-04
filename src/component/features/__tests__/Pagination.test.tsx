import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from '../conversion/Pagination';

describe('Pagination', () => {
  it('renders nothing when totalPages <= 1', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders page numbers and highlights current', () => {
    render(
      <Pagination currentPage={3} totalPages={10} onPageChange={vi.fn()} />,
    );
    const current = screen.getByRole('button', { current: 'page' });
    expect(current).toHaveTextContent('3');
  });

  it('calls onPageChange when a number is clicked', async () => {
    const onChange = vi.fn();
    render(
      <Pagination currentPage={1} totalPages={10} onPageChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('previous-page button is disabled on page 1', () => {
    render(
      <Pagination currentPage={1} totalPages={10} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
  });

  it('next-page button is disabled on the last page', () => {
    render(
      <Pagination currentPage={10} totalPages={10} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  it('group-jump moves by limit', async () => {
    const onChange = vi.fn();
    render(
      <Pagination currentPage={15} totalPages={50} onPageChange={onChange} />,
    );
    await userEvent.click(screen.getByLabelText('Previous 10 pages'));
    // currentGroup=2 → startPage=11, jump back goes to max(11-10,1) = 1
    expect(onChange).toHaveBeenCalledWith(1);

    onChange.mockClear();
    await userEvent.click(screen.getByLabelText('Next 10 pages'));
    // endPage=20, jump forward → min(20+1, 50) = 21
    expect(onChange).toHaveBeenCalledWith(21);
  });
});
