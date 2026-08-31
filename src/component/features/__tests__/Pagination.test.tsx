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
    expect(screen.getByLabelText('이전 쪽')).toBeDisabled();
  });

  it('next-page button is disabled on the last page', () => {
    render(
      <Pagination currentPage={10} totalPages={10} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('다음 쪽')).toBeDisabled();
  });

  it('group-jump moves by limit', async () => {
    const onChange = vi.fn();
    render(
      <Pagination currentPage={15} totalPages={50} onPageChange={onChange} />,
    );
    await userEvent.click(screen.getByLabelText('이전 묶음'));
    // currentGroup=2 → startPage=11, jump back goes to max(11-10,1) = 1
    expect(onChange).toHaveBeenCalledWith(1);

    onChange.mockClear();
    await userEvent.click(screen.getByLabelText('다음 묶음'));
    // endPage=20, jump forward → min(20+1, 50) = 21
    expect(onChange).toHaveBeenCalledWith(21);
  });

  // 묶음 크기는 폭에 따라 달라진다(넓은 창에서 번호를 더 보여준다).
  // 앞뒤 이동이 그 실제 크기를 따라가는지 — 10으로 굳어 있으면 건너뛰거나 겹친다.
  it('group-jump follows the actual group size, not a fixed 10', async () => {
    const onChange = vi.fn();
    render(
      <Pagination
        currentPage={15}
        totalPages={50}
        limit={5}
        onPageChange={onChange}
      />,
    );
    // limit=5 → currentGroup=2, startPage=11, endPage=15
    await userEvent.click(screen.getByLabelText('이전 묶음'));
    expect(onChange).toHaveBeenCalledWith(6);

    onChange.mockClear();
    await userEvent.click(screen.getByLabelText('다음 묶음'));
    expect(onChange).toHaveBeenCalledWith(16);
  });
});
