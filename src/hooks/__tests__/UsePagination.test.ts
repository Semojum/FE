import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePagination } from '../UsePagination';

describe('usePagination', () => {
  it('returns 1..10 when on page 1 of 50 with limit 10', () => {
    const { result } = renderHook(() =>
      usePagination({ currentPage: 1, totalPages: 50, limit: 10 }),
    );
    expect(result.current.pageNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.current.startPage).toBe(1);
    expect(result.current.endPage).toBe(10);
    expect(result.current.hasPrevGroup).toBe(false);
    expect(result.current.hasNextGroup).toBe(true);
  });

  it('returns 11..20 when on page 15 of 50 with limit 10', () => {
    const { result } = renderHook(() =>
      usePagination({ currentPage: 15, totalPages: 50, limit: 10 }),
    );
    expect(result.current.pageNumbers).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(result.current.hasPrevGroup).toBe(true);
    expect(result.current.hasNextGroup).toBe(true);
  });

  it('clips end to totalPages on the last group', () => {
    const { result } = renderHook(() =>
      usePagination({ currentPage: 47, totalPages: 47, limit: 10 }),
    );
    expect(result.current.pageNumbers).toEqual([41, 42, 43, 44, 45, 46, 47]);
    expect(result.current.hasNextGroup).toBe(false);
    expect(result.current.hasPrevGroup).toBe(true);
  });

  it('handles small total page count', () => {
    const { result } = renderHook(() =>
      usePagination({ currentPage: 1, totalPages: 3, limit: 10 }),
    );
    expect(result.current.pageNumbers).toEqual([1, 2, 3]);
    expect(result.current.hasPrevGroup).toBe(false);
    expect(result.current.hasNextGroup).toBe(false);
  });

  it('respects custom limit', () => {
    const { result } = renderHook(() =>
      usePagination({ currentPage: 4, totalPages: 20, limit: 5 }),
    );
    expect(result.current.pageNumbers).toEqual([1, 2, 3, 4, 5]);
  });
});
