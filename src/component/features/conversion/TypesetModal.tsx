import React from 'react';
import Modal, { ModalButton } from '../../shared/Modal';
import TypesetSettings from './TypesetSettings';
import { describeTypeset, type TypesetOptions } from '../../../utils/typesetOptions';

// 이 파일의 조판 설정 — 판면에서 우클릭으로 연다.
//
// 조판 설정은 작업(파일)마다 다르다. 1차 PoC 시연에서 정한 모델 그대로 마이페이지
// "점역 기본 설정"은 새 작업의 초기값이고, 여기서 고친 값은 **이 작업에만** 붙는다.
// 업로드 때 한 번 정하고 끝이던 것을 편집 중에도 열 수 있게 한다 — 규격이나
// 페이지행은 판면을 다 그려 본 뒤에야 판단이 서는 값이다.

interface Props {
  isOpen: boolean;
  value: TypesetOptions;
  // 파일 이름 — 어느 작업의 설정을 고치는 중인지 제목에서 바로 읽히게 한다.
  fileName?: string | null;
  onChange: (next: TypesetOptions) => void;
  onClose: () => void;
}

const TypesetModal: React.FC<Props> = ({
  isOpen,
  value,
  fileName,
  onChange,
  onClose,
}) => {
  return (
  <Modal
    isOpen={isOpen}
    title="이 파일의 조판 설정"
    onClose={onClose}
    footer={<ModalButton variant="primary" onClick={onClose}>닫기</ModalButton>}
  >
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-gray-500">
        {fileName ? `"${fileName}"에만 적용됩니다.` : '지금 열려 있는 작업에만 적용됩니다.'}{' '}
        바꾸는 즉시 판면이 다시 짜입니다.
      </p>
      {/* 조판 옵션은 업로드 시점에 확정되고 이를 고치는 API가 없다(V3 명세 V30).
          여기서 바꾼 값이 파일에 반영되는 것처럼 읽히면 안 된다. */}
      <p className="rounded-[10px] bg-[#fbf1de] px-3 py-2 text-[11px] leading-relaxed text-[#8a5a00]">
        이 창에서 바꾼 값은 <b>화면에만</b> 적용됩니다. 내려받는 파일과 다음에 이
        작업을 열 때는 <b>업로드할 때 고른 설정</b>이 쓰입니다 — 규격을 바꿔 작업하려면
        파일을 올릴 때 정해 주세요.
      </p>
      <TypesetSettings value={value} onChange={onChange} />
      <p className="text-[11px] text-gray-400">{describeTypeset(value)}</p>
    </div>
    </Modal>
  );
};

export default TypesetModal;
