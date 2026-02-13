// src/components/common/Pagination/usePagination.ts

import { useMemo } from 'react';

interface UsePaginationProps {
  currentPage: number;
  totalPages: number;
  limit: number;
}

export const usePagination = ({
  currentPage,
  totalPages,
  limit,
}: UsePaginationProps) => {
  // 1. 현재 페이지가 속한 그룹 계산 (예: 1~10페이지는 0그룹, 11~20페이지는 1그룹)
  const currentGroup = Math.ceil(currentPage / limit) - 1;

  // 2. 현재 그룹의 시작 페이지 번호 계산
  const startPage = currentGroup * limit + 1;

  // 3. 현재 그룹의 끝 페이지 번호 계산 (전체 페이지 수를 넘지 않도록 Math.min 사용)
  const endPage = Math.min(startPage + limit - 1, totalPages);

  // 4. 페이지 번호 배열 생성 (Memoization 적용)
  // 의존성 배열에 startPage, endPage를 넣어 해당 값이 변할 때만 배열을 재생성합니다.
  const pageNumbers = useMemo(() => {
    const length = endPage - startPage + 1;
    if (length <= 0) return [];

    return Array.from({ length }, (_, i) => startPage + i);
  }, [startPage, endPage]);

  // 5. 이전/다음 그룹 존재 여부
  const hasPrevGroup = startPage > 1;
  const hasNextGroup = endPage < totalPages;

  return {
    pageNumbers,
    startPage,
    endPage,
    hasPrevGroup,
    hasNextGroup,
  };
};
