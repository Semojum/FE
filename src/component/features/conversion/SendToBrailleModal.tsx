import React from 'react';
import { Loader2 } from 'lucide-react';
import Modal, { ModalButton } from '../../shared/Modal';

// Figma V3-04 점역으로 보내기 — 덮어쓰기 확인.
// 점역 탭에 이미 작업물이 있을 때 띄운다(기능정의서 §3). 확인하면 그 탭의 작업물을
// 새 점역 결과로 교체한다. 기존 문서는 만들어진 시점부터 마이페이지에 남아 있으므로
// 따로 보관하는 절차가 없다.

interface Props {
  isOpen: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const SendToBrailleModal: React.FC<Props> = ({
  isOpen,
  busy,
  onCancel,
  onConfirm,
}) => (
  <Modal
    isOpen={isOpen}
    title="점역 탭에 작업 중인 문서가 있습니다"
    onClose={onCancel}
    busy={busy}
    footer={
      <>
        <ModalButton onClick={onCancel} disabled={busy}>
          취소
        </ModalButton>
        <ModalButton variant="danger" onClick={onConfirm} disabled={busy}>
          {busy && <Loader2 size={14} className="mr-1.5 inline animate-spin" />}
          덮어쓰기
        </ModalButton>
      </>
    }
  >
    <p className="text-[13px] leading-relaxed text-gray-500">
      점역 탭의 작업물을 이번 OCR 결과로 교체합니다. 기존 문서는 마이페이지에
      그대로 남아 있어 언제든 다시 열 수 있습니다.
    </p>
  </Modal>
);

export default SendToBrailleModal;
