import React, { useEffect, useRef } from 'react';

// 카드의 ⋯ 버튼과 우클릭이 같은 메뉴를 연다 (마이페이지 3-2 "메뉴 여는 법").
// 항목: 열기 / 이름 변경 / 폴더로 이동 / 다운로드 / 삭제
// 생성 중 파일은 이동·이름변경·삭제·다운로드가 모두 비활성이다.

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  // 비활성 이유를 툴팁으로 알려 준다.
  title?: string;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 148;

export const ContextMenu: React.FC<Props> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 스크롤하면 메뉴 위치가 어긋나므로 닫는다. 다만 메뉴를 여는 동작 자체가
    // 스크롤을 부르는 경우(격자 우클릭이 커서를 옮기며 스크롤)에는 뜨자마자 닫혀
    // 버리므로, 열린 직후 잠깐은 스크롤을 무시한다.
    let armed = false;
    const arm = window.setTimeout(() => {
      armed = true;
    }, 400);
    const onScroll = () => {
      if (armed) onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  // 화면 밖으로 넘치지 않도록 위치를 보정한다.
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - items.length * 34 - 16);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top, width: MENU_WIDTH }}
      className="fixed z-[65] overflow-hidden rounded-[10px] border border-gray-100 bg-white py-1.5 shadow-xl"
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          type="button"
          disabled={item.disabled}
          title={item.title}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={`block w-full px-4 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            item.danger
              ? 'text-[#ff3b30] hover:bg-red-50'
              : 'text-gray-700 hover:bg-[#eef3fc] hover:text-[#5b8ce6]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
