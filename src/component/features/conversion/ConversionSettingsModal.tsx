import React, { useEffect, useState } from 'react';
import { Hash, Settings2, Sparkles } from 'lucide-react';
import Modal, { ModalButton } from '../../shared/Modal';
import { TABS, type ConversionTab } from '../../../types';
import { loadBrailleDefaults } from '../../../utils/brailleDefaults';
import {
  DEFAULT_TYPESET,
  describeTypeset,
  type TypesetOptions,
} from '../../../utils/typesetOptions';
import TypesetSettings from './TypesetSettings';

// Figma V3-02 변환 설정 — 파일 선택 직후 (페이지 번호 · 꼬리말 · 조판 규격)
//
// 쪽번호·꼬리말은 업로드 시점에 확정된다(2026-08-04·08-07). 예전에는 드롭존 안에
// 체크박스와 입력칸을 붙여 뒀는데, 파일을 올리기 전에 눈에 띄지 않아 그냥 지나치기
// 쉬웠다. 파일을 고른 직후 이 모달로 물어보고 [변환 시작]을 눌러야 업로드한다.
//
// 1차 PoC(2026-08-26)에서 조판 옵션 요청이 늘었다(규격·페이지행 범위·표지 제외·
// 꼬리말 정렬). 매번 다 묻기에는 많아서 **기본값 요약 + 펼쳐서 바꾸기**로 둔다 —
// 기본값은 마이페이지의 점역 기본 설정에서 정한다.

interface Props {
  isOpen: boolean;
  fileName: string | null;
  /** 지금 올리는 모드 — 초안 생성(a)은 물을 것이 고급 점역 하나뿐이다. */
  mode: ConversionTab;
  onCancel: () => void;
  onStart: (
    insertPageNumber: boolean,
    footerText: string,
    typeset: TypesetOptions,
  ) => void;
}

const ConversionSettingsModal: React.FC<Props> = ({
  isOpen,
  fileName,
  mode,
  onCancel,
  onStart,
}) => {
  // 초안 생성(a)은 .txt를 내므로 판면 옵션(페이지행·규격·꼬리말)이 쓰이지 않는다.
  // 그래도 고급 점역은 골라야 한다 — 그림·표가 많은 교재일수록 더 큰 모델이 필요한데,
  // 지금까지 이 모드만 창 없이 바로 올라가 고를 자리가 없었다.
  const isDraft = mode === TABS.OCR;
  const [insertPageNumber, setInsertPageNumber] = useState(false);
  const [typeset, setTypeset] = useState<TypesetOptions>(DEFAULT_TYPESET);
  const [expanded, setExpanded] = useState(false);

  // 열릴 때마다 초기값으로 — 직전 파일의 설정이 흘러들면 안 된다.
  // 초기값은 점역 기본 설정(V3-06 사용량 화면)에서 정한 값이다.
  useEffect(() => {
    if (isOpen) {
      const defaults = loadBrailleDefaults();
      setInsertPageNumber(defaults.insertPageNumber);
      // 꼬리말은 예전부터 별도 항목이었다 — 조판 설정 안으로 합쳐 한 곳에서 다룬다.
      setTypeset({ ...defaults.typeset, footerText: defaults.footerText });
      setExpanded(false);
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
            onClick={() =>
              onStart(insertPageNumber, typeset.footerText.trim(), {
                ...typeset,
                footerText: typeset.footerText.trim(),
              })
            }
          >
            변환 시작
          </ModalButton>
        </>
      }
    >
      <p className="text-[13px] text-gray-500">
        {isDraft
          ? '읽는 방식을 정한 뒤 변환을 시작합니다.'
          : '점자 판면 옵션을 정한 뒤 변환을 시작합니다.'}
      </p>
      {fileName && (
        <p title={fileName} className="mt-1 truncate text-[12px] text-gray-400">
          {fileName}
        </p>
      )}

      {isDraft ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="rounded-[10px] bg-[#f5f8fc] px-3 py-2.5">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-gray-800">
                <Sparkles size={13} className="text-[#5b8ce6]" />
                고급 점역
              </span>
              <input
                type="checkbox"
                checked={typeset.advancedAi}
                onChange={(e) =>
                  setTypeset((t) => ({ ...t, advancedAi: e.target.checked }))
                }
                className="h-4 w-4 accent-[#5b8ce6]"
              />
            </label>
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              표와 그림이 많은 지면을 더 큰 모델로 읽습니다. 변환이 느려집니다.
            </p>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-gray-400">
            · 초안 생성은 묵자 초안을 만듭니다 — 페이지행·규격 같은 판면 옵션은
            점역으로 보낼 때 정합니다
          </p>
        </div>
      ) : (
      <div className="mt-4 border-t border-gray-100 pt-4">
        {/* 페이지 번호 삽입 — 켜야 아래 조판 설정의 페이지행 항목이 의미를 갖는다 */}
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
          <p className="mt-1 text-[11px] leading-snug text-gray-400">
            원본 쪽번호·꼬리말·점자 면 번호가 페이지행에 들어갑니다. 어느 면에 넣을지는
            아래 조판 설정에서 정합니다.
          </p>
        </div>

        {/* 조판 설정 — 평소에는 한 줄 요약, 필요할 때만 펼친다 */}
        <div className="mt-2 rounded-[10px] bg-[#f5f8fc] px-3 py-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? '조판 설정 접기' : '조판 설정 바꾸기'}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-gray-800">
              <Settings2 size={13} className="text-[#5b8ce6]" />
              조판 설정
            </span>
            <span className="text-[11px] font-medium text-[#407FAC]">
              {expanded ? '접기' : '바꾸기'}
            </span>
          </button>
          {expanded ? (
            <div className="mt-3">
              <TypesetSettings value={typeset} onChange={setTypeset} compact />
            </div>
          ) : (
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              {describeTypeset(typeset)}
            </p>
          )}
        </div>
      </div>
      )}

      <p className="mt-3 text-[11px] text-gray-400">
        · 여기서 정한 값은 변환이 끝난 뒤 에디터에서 바꿀 수 없습니다
      </p>
    </Modal>
  );
};

export default ConversionSettingsModal;
