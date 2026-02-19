// src/components/common/Pagination/index.tsx

import React from 'react';
import { PaginationProps } from '../../../types';
import { usePagination } from '../../../hooks/UsePagination.ts';

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  limit = 10, // 기본값 10 설정
}) => {
  // 예외 처리: 페이지가 없거나 1개뿐인 경우 렌더링 하지 않음
  if (totalPages <= 1) return null;

  // Custom Hook을 통해 로직 호출
  const { pageNumbers, hasPrevGroup, hasNextGroup, startPage, endPage } =
    usePagination({
      currentPage,
      totalPages,
      limit,
    });

  // 핸들러: 이전 그룹(10페이지 전)으로 이동
  const handlePrevGroup = () => {
    onPageChange(Math.max(startPage - limit, 1));
  };

  // 핸들러: 다음 그룹(10페이지 후)으로 이동
  const handleNextGroup = () => {
    onPageChange(Math.min(endPage + 1, totalPages));
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-2 mt-8 text-sm font-medium text-gray-500"
    >
      {/* << 10페이지 이전 이동 (첫 그룹일 때 숨김) */}
      <button
        onClick={handlePrevGroup}
        disabled={!hasPrevGroup}
        className="w-8 h-8 flex items-center justify-center hover:text-gray-900 disabled:opacity-0 transition-opacity"
        aria-label="Previous 10 pages"
      >
        &lt;&lt;
      </button>

      {/* < 이전 페이지 이동 */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="w-8 h-8 flex items-center justify-center hover:text-gray-900 disabled:opacity-30 transition-colors"
        aria-label="Previous page"
      >
        &lt;
      </button>

      {/* 페이지 번호 목록 */}
      <div className="flex items-center gap-1">
        {pageNumbers.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            aria-current={currentPage === page ? 'page' : undefined}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200
              ${
                currentPage === page
                  ? 'bg-[#5A8FBB] text-white shadow-md font-bold'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
          >
            {page}
          </button>
        ))}
      </div>

      {/* > 다음 페이지 이동 */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="w-8 h-8 flex items-center justify-center hover:text-gray-900 disabled:opacity-30 transition-colors"
        aria-label="Next page"
      >
        &gt;
      </button>

      {/* >> 10페이지 다음 이동 (마지막 그룹일 때 숨김) */}
      <button
        onClick={handleNextGroup}
        disabled={!hasNextGroup}
        className="w-8 h-8 flex items-center justify-center hover:text-gray-900 disabled:opacity-0 transition-opacity"
        aria-label="Next 10 pages"
      >
        &gt;&gt;
      </button>
    </nav>
  );
};

export default React.memo(Pagination);
