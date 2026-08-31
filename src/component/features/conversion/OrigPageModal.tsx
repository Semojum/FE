import React, { useState } from 'react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';

// 원본 쪽 번호를 그 쪽만 고친다 — 1차 PoC 1-4 기능4 "원본 페이지 번호 표시줄 편집".
//
// 페이지행에 들어가는 것은 원본 쪽 번호 · 꼬리말 · 점자 면 번호 셋이다. 꼬리말은
// [여기부터 꼬리말], 점자 면 번호는 조판 설정의 [점자 면 번호 시작]으로 고치고,
// 남은 하나가 이것이다. 스캔이 한 장 빠졌거나 번호가 튀는 문서에서 그 쪽만 맞춘다.
//
// 편집 좌표(어느 블록의 몇 번째 줄인지)는 서버가 준 원본 쪽 번호를 그대로 쓰므로
// 여기서 바꾸는 것은 **판면에 적히는 숫자뿐**이다.

interface Props {
  // 서버가 준 원본 쪽 번호(이 값으로 저장한다)
  pageNo: number;
  // 지금 판면에 적히는 번호
  shown: number;
  // 이 쪽에 이미 손댄 값이 있는지
  overridden: boolean;
  onSubmit: (shown: number | null) => void;
  onClose: () => void;
}

const OrigPageModal: React.FC<Props> = ({
  pageNo,
  shown,
  overridden,
  onSubmit,
  onClose,
}) => {
  const [text, setText] = useState(String(shown));
  const parsed = Number(text);
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 9999;

  return (
    <Modal
      isOpen
      title="원본 쪽 번호 고치기"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>취소</ModalButton>
          {overridden && (
            <ModalButton onClick={() => onSubmit(null)}>되돌리기</ModalButton>
          )}
          <ModalButton
            variant="primary"
            disabled={!valid}
            onClick={() => valid && onSubmit(Math.round(parsed))}
          >
            적용
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-gray-500">
          판면에 적을 번호
        </label>
        <input
          autoFocus
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onSubmit(Math.round(parsed));
          }}
          className={modalInputCls}
          aria-label="판면에 적을 원본 쪽 번호"
        />
        {!valid && (
          <p className="text-[11px] text-[#ff3b30]">
            0부터 9999까지의 숫자를 넣어 주세요.
          </p>
        )}
        <p className="text-[12px] leading-relaxed text-gray-500">
          이 문서의 {pageNo}번째 원본 쪽에만 적용됩니다. 페이지행과 원본 쪽
          변경선에 적히는 숫자만 바뀌고, 편집 위치는 그대로입니다.
        </p>
      </div>
    </Modal>
  );
};

export default OrigPageModal;
