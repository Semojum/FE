import React, { useEffect, useRef, useState } from 'react';
import Modal, { ModalButton } from '../../shared/Modal';
import TypesetSettings from './TypesetSettings';
import { describeTypeset, type TypesetOptions } from '../../../utils/typesetOptions';

// 이 파일의 조판 설정 — 판면에서 도구 줄로 연다.
//
// 조판 설정은 작업(파일)마다 다르다. 1차 PoC 시연에서 정한 모델 그대로 마이페이지
// "점역 기본 설정"은 새 작업의 초기값이고, 여기서 고친 값은 **이 작업에만** 붙는다.
// 업로드 때 한 번 정하고 끝이던 것을 편집 중에도 열 수 있게 한다 — 규격이나
// 페이지행은 판면을 다 그려 본 뒤에야 판단이 서는 값이다.
//
// ★ 고치는 즉시 반영하지 않는다(2026-09-02 요청). 값 하나가 바뀔 때마다 문서 전체가
//   다시 조판되는데, 칸 수처럼 판면을 통째로 다시 짜는 값에서는 그 사이에 들어온
//   입력이 엉뚱하게 먹혔다 — 숫자 칸의 화살표를 한 번 눌렀는데 4~8씩 뛰던 것이
//   그것이다(다시 그리는 동안 브라우저의 자동 반복이 쌓인다). 여기서는 초안만
//   만들고, [적용]을 눌러야 판면이 다시 짜인다.

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
  // 창 안에서만 도는 초안. 열릴 때 지금 값에서 시작한다.
  const [draft, setDraft] = useState<TypesetOptions>(value);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) setDraft(value);
    wasOpen.current = isOpen;
  }, [isOpen, value]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  return (
    <Modal
      isOpen={isOpen}
      title="이 파일의 조판 설정"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>닫기</ModalButton>
          <ModalButton
            variant="primary"
            disabled={!dirty}
            onClick={() => onChange(draft)}
          >
            적용
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] leading-relaxed text-gray-500">
          {fileName ? `"${fileName}"에만 적용됩니다.` : '지금 열려 있는 작업에만 적용됩니다.'}{' '}
          <b>적용</b>을 눌러야 판면이 다시 짜입니다.
        </p>
        {/* 조판 옵션은 업로드 시점에 확정되고 이를 고치는 API가 없다(V3 명세 V30).
            여기서 바꾼 값이 파일에 반영되는 것처럼 읽히면 안 된다. */}
        <p className="rounded-[10px] bg-[#fbf1de] px-3 py-2 text-[11px] leading-relaxed text-[#8a5a00]">
          이 창에서 바꾼 값은 <b>화면에만</b> 적용됩니다. 내려받는 파일과 다음에 이
          작업을 열 때는 <b>업로드할 때 고른 설정</b>이 쓰입니다 — 규격을 바꿔 작업하려면
          파일을 올릴 때 정해 주세요.
        </p>
        <TypesetSettings value={draft} onChange={setDraft} />
        <p className="text-[11px] text-gray-400">{describeTypeset(draft)}</p>
      </div>
    </Modal>
  );
};

export default TypesetModal;
