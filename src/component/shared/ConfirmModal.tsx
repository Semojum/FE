import React from 'react';
import Modal, { ModalButton } from './Modal';

// 되돌릴 수 없는 동작 앞에서 한 번 더 묻는 창.
//
// 예전에는 window.confirm을 썼는데 데스크톱 웹뷰(Tauri)에서는 이 대화상자가 뜨지
// 않는다 — 사용자에게는 "취소를 눌렀는데 아무것도 안 뜨고 아무 일도 없다"로 보였다
// (2026-08-24 QA). 앱 안의 모달로 물어야 두 환경에서 같게 동작한다.

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  // 확인 버튼 문구. 무엇을 하게 되는지 그 자리에서 읽히도록 동작 이름을 쓴다.
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const ConfirmModal: React.FC<Props> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = '취소',
  busy = false,
  onConfirm,
  onClose,
}) => (
  <Modal
    isOpen={isOpen}
    busy={busy}
    title={title}
    onClose={onClose}
    footer={
      <>
        <ModalButton disabled={busy} onClick={onClose}>
          {cancelLabel}
        </ModalButton>
        <ModalButton variant="danger" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </ModalButton>
      </>
    }
  >
    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
      {message}
    </p>
  </Modal>
);

export default ConfirmModal;
