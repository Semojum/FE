import React from 'react';
import { Loader2 } from 'lucide-react';
import Modal, { ModalButton } from '../../shared/Modal';

// Figma V3-04 점역으로 보내기 — 덮어쓰기 확인.
// 서버가 409 JOB4011(기존 연결 문서 존재)을 주면 이 확인을 거쳐 overwrite=true로 다시 보낸다.
// 덮어쓰면 기존 모드 b 문서는 '(이전본)' 이름으로 마이페이지에 자동 보관된다.

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
    title="이미 점역으로 보낸 문서가 있습니다"
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
      이 작업에서 만든 점역 문서를 새로 만듭니다. 기존 문서는 이름 뒤에
      &lsquo;(이전본)&rsquo;이 붙어 마이페이지에 보관됩니다.
    </p>
  </Modal>
);

export default SendToBrailleModal;
