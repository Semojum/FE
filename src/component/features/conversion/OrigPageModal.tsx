import React, { useState } from 'react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';
import {
  START_PAGE_MAX,
  START_PAGE_MIN,
} from '../../../utils/typesetOptions';

// 원본 쪽 번호 시작 — "이 문서의 첫 쪽이 실제로 몇 쪽인가".
//
// 표지를 빼고 스캔했거나 책 중간부터 올렸을 때 실제 쪽 번호와 맞춘다. 첫 쪽만
// 정하면 뒤는 따라 매겨진다. 서버가 sourcePageStart로 저장하므로(V3 API 명세
// "조판 옵션 V30") 화면과 내려받는 .brf가 같은 번호로 나온다.
//
// 편집 좌표(어느 블록의 몇 번째 줄인지)는 서버가 준 쪽 번호를 그대로 쓴다 —
// 여기서 바꾸는 것은 판면에 **적히는 숫자**뿐이다.

interface Props {
  /** 지금 적용된 시작 번호 */
  value: number;
  /** 이 문서의 첫 원본 쪽(서버 기준) — 안내 문구에 쓴다 */
  firstPage: number;
  onSubmit: (start: number) => void;
  onClose: () => void;
}

const OrigPageModal: React.FC<Props> = ({
  value,
  firstPage,
  onSubmit,
  onClose,
}) => {
  const [text, setText] = useState(String(value));
  const parsed = Number(text);
  const valid =
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= START_PAGE_MIN &&
    parsed <= START_PAGE_MAX;

  return (
    <Modal
      isOpen
      title="원본 쪽 번호"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>취소</ModalButton>
          <ModalButton
            variant="primary"
            disabled={!valid}
            onClick={() => valid && onSubmit(parsed)}
          >
            적용
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-gray-500" htmlFor="orig-page-start">
          이 문서의 첫 쪽을 몇 쪽으로 셀까요?
        </label>
        <input
          id="orig-page-start"
          autoFocus
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onSubmit(parsed);
          }}
          className={modalInputCls}
        />
        {!valid ? (
          <p className="text-[11px] text-[#ff3b30]">
            {START_PAGE_MIN}부터 {START_PAGE_MAX}까지의 숫자를 넣어 주세요.
          </p>
        ) : (
          <p className="text-[12px] leading-relaxed text-gray-500">
            뒤 쪽은 {parsed + 1}, {parsed + 2} … 로 따라 매겨집니다. 페이지행과
            원본 쪽 변경선에 적히는 숫자만 바뀌고, 편집 위치는 그대로입니다.
          </p>
        )}
        {firstPage !== 1 && (
          <p className="text-[11px] text-gray-400">
            지금 이 작업의 첫 원본 쪽은 {firstPage}쪽입니다.
          </p>
        )}
      </div>
    </Modal>
  );
};

export default OrigPageModal;
