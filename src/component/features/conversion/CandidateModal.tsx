import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { BlockDraft, ConversionTab, TABS } from '../../../types';
import { previewRows, toCells } from '../../../utils/brailleGrid';

// 대체 텍스트 선택 — 기획 정본 "모눈종이 뷰" S4·S5.
//
// 안을 목록으로 늘어놓지 않고 방식(라벨)을 탭으로 세우고 한 안을 크게 보여 준다.
// 안이 표·그림을 어떻게 풀었는지는 통째로 봐야 판단이 되기 때문이다.
//  - OCR 변환(a)     : 묵자(텍스트)만
//  - 점역·통합(b·c)  : 묵자 원문 + 점자 미리보기(앞 몇 줄, 판면과 같은 32칸 규칙)
// 지금 쓰는 안에는 ● 를 붙이고, 열 때 그 탭부터 보여 준다.

// 미리보기로 보여 줄 점자 줄 수 (기획 §2 "모드별 — 앞 3~4줄")
const PREVIEW_ROWS = 4;

interface CandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: string[];
  // drafts가 있으면 라벨(방식명)·묵자 원문과 함께 표시한다. 없으면 candidates만.
  drafts?: BlockDraft[];
  // 모드에 따라 묵자만 보일지, 묵자+점자를 보일지가 갈린다.
  mode?: ConversionTab;
  // idx는 drafts 배열의 인덱스(0부터). -1은 AI 원본으로 되돌리기(명세 selectedIdx=-1).
  onSelect: (text: string, idx: number) => void;
  currentText: string;
  // 이 블록을 이미 손으로 고쳤는지 — 안을 적용하면 그 편집이 사라지므로 한 번 확인한다.
  isEdited?: boolean;
}

const BraillePreview: React.FC<{ text: string }> = ({ text }) => (
  <div className="w-max rounded-lg border border-[#e4ebf5] bg-white p-1.5">
    {previewRows(text, PREVIEW_ROWS).map((row, i) => (
      <div key={i} className="flex">
        {toCells(row).map((ch, j) => (
          <span
            key={j}
            className="h-[17px] w-[15px] shrink-0 text-center text-[13px] leading-[17px] text-gray-800"
          >
            {ch || '⠀'}
          </span>
        ))}
      </div>
    ))}
  </div>
);

const CandidateModal: React.FC<CandidateModalProps> = ({
  isOpen,
  onClose,
  candidates,
  drafts,
  mode = TABS.OCR,
  onSelect,
  currentText,
  isEdited,
}) => {
  // drafts(라벨/묵자 포함)가 오면 우선 사용하고, 아니면 문자열 후보로 폴백.
  const entries: BlockDraft[] = useMemo(
    () =>
      drafts && drafts.length > 0
        ? drafts
        : candidates.map((content) => ({ content })),
    [drafts, candidates],
  );

  // 지금 본문으로 쓰고 있는 안 — ● 표시와 "열 때 그 탭부터"의 기준.
  const inUseIdx = entries.findIndex((e) => e.content === currentText);
  const [tab, setTab] = useState(0);
  // 적용 전 확인 단계(편집한 블록일 때만) — 열 때마다 초기화한다.
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTab(inUseIdx >= 0 ? inUseIdx : 0);
    setIsConfirming(false);
    // 열릴 때 한 번만 맞춘다 — 보는 중에 탭이 되돌아가면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const active = entries[tab];
  const isBraille = mode !== TABS.OCR;
  // 점자 모드에서만 묵자와 점자가 따로 있다. OCR은 묵자가 곧 본문이다.
  const printText = isBraille ? active?.printText : active?.content;
  const brailleText = isBraille ? active?.content : undefined;
  const isInUse = tab === inUseIdx;

  const apply = () => {
    if (!active) return;
    // 이미 손으로 고친 블록이면 "편집 내용이 사라집니다"를 한 번 확인한다(기획 §2).
    if (isEdited && !isConfirming) {
      setIsConfirming(true);
      return;
    }
    onSelect(active.content, tab);
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="대체 텍스트 선택"
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-4">
            <h3 className="font-semibold text-gray-700">대체 텍스트 선택</h3>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="rounded-full p-1 transition-colors hover:bg-gray-200"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          {entries.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">
              추천할 대체 텍스트가 없습니다.
            </p>
          ) : (
            <>
              {/* 방식 탭 — 안 하나당 하나. 지금 쓰는 안에 ● */}
              <div
                role="tablist"
                aria-label="대체 텍스트 방식"
                className="flex flex-wrap gap-1.5 border-b border-gray-100 px-4 py-3"
              >
                {entries.map((entry, idx) => (
                  <button
                    key={idx}
                    role="tab"
                    type="button"
                    aria-selected={idx === tab}
                    onClick={() => {
                      setTab(idx);
                      setIsConfirming(false);
                    }}
                    className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                      idx === tab
                        ? 'bg-[#5A8FBB] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {idx === inUseIdx && <span aria-hidden>● </span>}
                    {entry.label ?? `${idx + 1}번 안`}
                    {idx === inUseIdx && (
                      <span className="sr-only"> (지금 쓰는 안)</span>
                    )}
                  </button>
                ))}
              </div>

              <div
                role="tabpanel"
                className="max-h-[52vh] overflow-y-auto px-4 py-3"
              >
                {printText && (
                  <>
                    <p className="mb-1 text-[11px] font-semibold text-gray-400">
                      {isBraille ? '묵자' : '텍스트'}
                    </p>
                    <p className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-2.5 text-[13px] leading-relaxed text-gray-700">
                      {printText}
                    </p>
                  </>
                )}

                {brailleText && (
                  <>
                    <p className="mb-1 mt-3 text-[11px] font-semibold text-gray-400">
                      점자
                    </p>
                    <div className="overflow-x-auto">
                      <BraillePreview text={brailleText} />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
                {isConfirming && (
                  <p className="mr-auto text-[12px] font-medium text-[#f47726]">
                    이 블록의 편집 내용이 사라집니다.
                  </p>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-200 px-4 py-1.5 text-[13px] font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={isInUse && !isConfirming}
                  title={isInUse ? '이미 이 안을 쓰고 있습니다' : undefined}
                  className="rounded-lg bg-[#5A8FBB] px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#4a7ba6] disabled:opacity-40"
                >
                  {isConfirming ? '그래도 적용' : '이 안 사용'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CandidateModal;
