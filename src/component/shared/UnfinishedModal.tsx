import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal, { ModalButton } from './Modal';
import { UNFINISHED, type UnfinishedId } from '../../utils/unfinished';

// "아직 완성되지 않은 기능입니다" 안내.
//
// 막기만 하고 이유를 안 적으면 고장으로 읽힌다. 무엇이 안 되는지와 무엇을 기다리는지
// 두 가지를 함께 적는다(문구는 utils/unfinished.ts).
//
// 변환 설정 모달(z-60) 위에서도 떠야 하므로 한 겹 위에 둔다.

interface Props {
  id: UnfinishedId | null;
  onClose: () => void;
}

const UnfinishedModal: React.FC<Props> = ({ id, onClose }) => {
  const notice = id ? UNFINISHED[id] : null;
  return (
    <Modal
      isOpen={!!notice}
      zIndex={75}
      title={notice?.title ?? ''}
      onClose={onClose}
      footer={
        <ModalButton variant="primary" onClick={onClose}>
          확인
        </ModalButton>
      }
    >
      <div className="flex gap-2.5">
        <AlertTriangle
          size={16}
          className="mt-0.5 shrink-0 text-[#f47726]"
          aria-hidden
        />
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
          {notice?.body}
        </p>
      </div>
    </Modal>
  );
};

export default UnfinishedModal;
