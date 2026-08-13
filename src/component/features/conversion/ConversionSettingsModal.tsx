import React, { useEffect, useState } from 'react';
import { Hash, Pilcrow } from 'lucide-react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';
import { FOOTER_TEXT_MAX_LENGTH } from '../../../utils/fileValidation';

// Figma V3-02 변환 설정 — 파일 선택 직후 (페이지 번호 · 꼬리말)
//
// 쪽번호·꼬리말은 업로드 시점에 확정된다(2026-08-04·08-07). 예전에는 드롭존 안에
// 체크박스와 입력칸을 붙여 뒀는데, 파일을 올리기 전에 눈에 띄지 않아 그냥 지나치기
// 쉬웠다. 파일을 고른 직후 이 모달로 물어보고 [변환 시작]을 눌러야 업로드한다.

interface Props {
  isOpen: boolean;
  fileName: string | null;
  onCancel: () => void;
  onStart: (insertPageNumber: boolean, footerText: string) => void;
}

const ConversionSettingsModal: React.FC<Props> = ({
  isOpen,
  fileName,
  onCancel,
  onStart,
}) => {
  const [insertPageNumber, setInsertPageNumber] = useState(false);
  const [footerText, setFooterText] = useState('');

  // 열릴 때마다 초기값으로 — 직전 파일의 설정이 흘러들면 안 된다.
  useEffect(() => {
    if (isOpen) {
      setInsertPageNumber(false);
      setFooterText('');
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      title="변환 설정"
      onClose={onCancel}
      footer={
        <>
          <ModalButton onClick={onCancel}>취소</ModalButton>
          <ModalButton
            variant="danger"
            onClick={() => onStart(insertPageNumber, footerText.trim())}
          >
            변환 시작
          </ModalButton>
        </>
      }
    >
      <p className="text-[13px] text-gray-500">
        점자 판면 옵션을 정한 뒤 변환을 시작합니다.
      </p>
      {fileName && (
        <p title={fileName} className="mt-1 truncate text-[12px] text-gray-400">
          {fileName}
        </p>
      )}

      <div className="mt-4 border-t border-gray-100 pt-4">
        {/* 페이지 번호 삽입 */}
        <div className="rounded-[10px] bg-[#f5f8fc] px-3 py-2.5">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-gray-800">
              <Hash size={13} className="text-[#5b8ce6]" />
              페이지행 넣기
            </span>
            <input
              type="checkbox"
              checked={insertPageNumber}
              onChange={(e) => setInsertPageNumber(e.target.checked)}
              className="h-4 w-4 accent-[#5b8ce6]"
            />
          </label>
          {/* 지침 1장 2절 2-1에 따라 페이지행은 홀수 면에만 들어간다.
              "판면 마지막 줄"이라고만 쓰면 매 면마다 들어갈 것처럼 읽힌다. */}
          <p className="mt-1 text-[11px] leading-snug text-gray-400">
            홀수 면 마지막 줄에 원본 쪽번호·꼬리말·점자 면 번호가 들어갑니다.
          </p>
        </div>

        {/* 꼬리말 */}
        <div className="mt-2 rounded-[10px] bg-[#f5f8fc] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-gray-800">
              <Pilcrow size={13} className="text-[#5b8ce6]" />
              꼬리말
            </span>
            <span className="text-[11px] text-gray-400">
              {footerText.length} / {FOOTER_TEXT_MAX_LENGTH}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-gray-400">
            페이지행 가운데에 점역해 표기합니다 (선택)
          </p>
          <input
            type="text"
            value={footerText}
            maxLength={FOOTER_TEXT_MAX_LENGTH}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="예: 수학 익힘책 1"
            className={`${modalInputCls} mt-2 h-[38px] text-[13px]`}
          />
        </div>
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        · 두 옵션은 변환이 끝난 뒤 에디터에서 바꿀 수 없습니다
      </p>
    </Modal>
  );
};

export default ConversionSettingsModal;
