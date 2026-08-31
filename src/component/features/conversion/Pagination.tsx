// src/components/common/Pagination/index.tsx

import React, { useEffect, useState } from 'react';
import { PaginationProps } from '../../../types';
import { usePagination } from '../../../hooks/UsePagination.ts';

// 번호 하나가 차지하는 폭(w-8 32px + gap-1 4px)과 좌우 화살표 네 개가 쓰는 폭.
const BTN_W = 36;
const ARROWS_W = 4 * 40 + 16;
// 한 번에 보여줄 번호 개수의 아래/위 한계. 위 한계가 없으면 넓은 화면에서 번호가
// 수십 개 늘어서 오히려 짚기 어렵다.
const MIN_LIMIT = 10;
const MAX_LIMIT = 24;

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  limit,
}) => {
  // 창을 키우면 아래에 자리가 남는데도 번호는 늘 열 개에서 끊겼다 — 넓은 화면에서는
  // 목록이 잘린 것처럼 보인다(2026-08-28). 실제 폭을 재서 들어가는 만큼 보여준다.
  // 콜백 ref로 받는다 — 쪽이 하나뿐이면 nav 자체가 없다가 나중에 생기는데,
  // useRef + 빈 의존성 useEffect로는 그때 폭을 다시 재지 못한다.
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return;
    // observe()는 등록 즉시 현재 크기로 한 번 호출된다 — 첫 값은 그것으로 받는다.
    const ro = new ResizeObserver(() => setWidth(box.clientWidth));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  const fitLimit =
    width > 0
      ? Math.min(
          MAX_LIMIT,
          Math.max(MIN_LIMIT, Math.floor((width - ARROWS_W) / BTN_W)),
        )
      : MIN_LIMIT;

  // Custom Hook을 통해 로직 호출
  // (훅보다 먼저 return하면 안 된다 — 쪽수가 1↔2를 오갈 때 훅 개수가 달라져
  //  React가 상태를 잘못 이어 붙인다. 렌더 생략은 훅 호출 뒤에서 한다.)
  const { pageNumbers, hasPrevGroup, hasNextGroup, startPage, endPage } =
    usePagination({
      currentPage,
      totalPages,
      limit: limit ?? fitLimit,
    });

  // 예외 처리: 페이지가 없거나 1개뿐인 경우 렌더링 하지 않음
  // (폭을 재는 useEffect가 먼저 돌아야 하므로 훅 뒤에서 걸러낸다. 여기서 null을
  //  돌려주면 ref가 비어 다음에 다시 뜰 때 폭을 못 재는데, ResizeObserver가
  //  붙는 시점이 마운트라 문제되지 않는다 — 조건이 바뀌면 새로 마운트된다.)
  if (totalPages <= 1) return null;

  // 핸들러: 한 묶음 앞으로 이동
  const handlePrevGroup = () => {
    onPageChange(Math.max(startPage - (endPage - startPage + 1), 1));
  };

  // 핸들러: 한 묶음 뒤로 이동
  const handleNextGroup = () => {
    onPageChange(Math.min(endPage + 1, totalPages));
  };

  return (
    <nav
      ref={setBox}
      aria-label="Pagination"
      className="flex items-center justify-center gap-2 mt-4 text-sm font-medium text-gray-500"
    >
      {/* << 한 묶음 앞으로 (첫 묶음일 때 숨김) */}
      <button
        onClick={handlePrevGroup}
        disabled={!hasPrevGroup}
        className="w-8 h-8 flex items-center justify-center hover:text-gray-900 disabled:opacity-0 transition-opacity"
        aria-label="이전 묶음"
      >
        &lt;&lt;
      </button>

      {/* < 이전 페이지 이동 */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="w-8 h-8 flex items-center justify-center hover:text-gray-900 disabled:opacity-30 transition-colors"
        aria-label="이전 쪽"
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
        aria-label="다음 쪽"
      >
        &gt;
      </button>

      {/* >> 한 묶음 뒤로 (마지막 묶음일 때 숨김) */}
      <button
        onClick={handleNextGroup}
        disabled={!hasNextGroup}
        className="w-8 h-8 flex items-center justify-center hover:text-gray-900 disabled:opacity-0 transition-opacity"
        aria-label="다음 묶음"
      >
        &gt;&gt;
      </button>
    </nav>
  );
};

export default React.memo(Pagination);
