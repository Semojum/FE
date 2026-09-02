import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

// Figma V3 모달 공통 껍데기 (S3~S6 · 다운로드 · 덮어쓰기 확인).
// 공통 규칙(마이페이지 3-2 "모달 공통"): 바깥 클릭이나 ESC로 닫힌다.
// 요청 중에는 호출부가 버튼을 비활성화하고, 실패하면 토스트를 띄운다.

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  // 하단 우측 버튼 영역
  footer?: React.ReactNode;
  // 요청 중이면 ESC·바깥 클릭 닫기를 막는다.
  busy?: boolean;
  // 다른 모달 **위에** 띄워야 할 때만 올린다(변환 설정 모달 위의 안내 등).
  // 기본값은 토스트(z-70)보다 아래인 60 — 지금까지의 모든 모달이 쓰던 값이다.
  zIndex?: number;
  /** 카드 최대 너비. 목록을 담는 창처럼 400px로는 좁은 데가 있다. */
  maxWidth?: number;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  onClose,
  children,
  footer,
  busy = false,
  zIndex = 60,
  maxWidth = 400,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, busy]);

  // 열릴 때 첫 입력 요소로 포커스를 옮긴다.
  useEffect(() => {
    if (!isOpen) return;
    const first = cardRef.current?.querySelector<HTMLElement>(
      'input, textarea, button',
    );
    first?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{ zIndex }}
      className="fixed inset-0 flex items-center justify-center bg-black/30 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // 내용이 길면 카드가 화면 밖으로 자라 제목도 [닫기]도 손이 닿지 않았다
        // (조판 설정처럼 항목이 많은 모달). 카드는 화면 안에 가두고 **본문만**
        // 스크롤한다 — 제목과 버튼 줄은 늘 제자리에 있어야 한다.
        style={{ maxWidth }}
        className="flex max-h-[calc(100vh-48px)] w-full flex-col rounded-[14px] bg-white p-6 shadow-xl"
      >
        <h2 className="shrink-0 text-[15px] font-bold text-gray-800">{title}</h2>
        {/* min-h-0이 있어야 flex 자식이 내용 높이만큼 부풀지 않고 줄어든다. */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="mt-5 flex shrink-0 justify-end gap-2">{footer}</div>
        )}
      </motion.div>
    </div>
  );
};

// 모달 공통 버튼 — 파랑은 이동·선택, 오렌지는 행동·주의(마이페이지 UX 원칙).
export const ModalButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'ghost' | 'danger';
  }
> = ({ variant = 'ghost', className = '', ...props }) => {
  const styles = {
    primary: 'bg-[#5b8ce6] text-white hover:bg-[#4a7bd4]',
    ghost: 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
    danger: 'bg-[#f47726] text-white hover:brightness-95',
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`h-[38px] rounded-[10px] px-5 text-sm font-semibold transition-colors disabled:opacity-50 ${styles} ${className}`}
    />
  );
};

// 모달 안 텍스트 입력 공통 스타일
export const modalInputCls =
  'h-[42px] w-full rounded-[10px] border border-[#5b8ce6] bg-white px-4 text-sm text-gray-700 placeholder:text-[#adadad] outline-none focus:ring-2 focus:ring-[#5b8ce6]/20';

export default Modal;
