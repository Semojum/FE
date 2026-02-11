import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  // 페이지 번호 배열 생성 (예: 1, 2, 3, 4, 5)
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-center gap-4 mt-8 text-sm font-medium text-gray-400">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="hover:text-gray-600 disabled:opacity-30 transition-colors"
      >
        &lt; 이전
      </button>

      <div className="flex items-center gap-2">
        {pages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-all
              ${
                currentPage === page
                  ? 'bg-[#5A8FBB] text-white shadow-md'
                  : 'hover:bg-gray-100'
              }`}
          >
            {page}
          </button>
        ))}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="hover:text-gray-600 disabled:opacity-30 transition-colors"
      >
        다음 &gt;
      </button>
    </div>
  );
};

export default Pagination;
