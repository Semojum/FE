import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { BlockDraft } from '../../../types';

interface CandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: string[];
  // drafts가 있으면 라벨(방식명)·점역사주 설명과 함께 표시한다. 없으면 candidates만.
  drafts?: BlockDraft[];
  // idx는 drafts 배열의 인덱스(0부터). 이미 선택된 초안을 다시 누르면 -1을 넘겨
  // AI 원본으로 되돌리는 스와프가 된다 (대체 초안 D-1).
  onSelect: (text: string, idx: number) => void;
  currentText: string;
  // AI 원본 — 스와프로 되돌아갈 대상. 없으면 currentText를 원본으로 본다.
  originalText?: string;
}

const CandidateModal: React.FC<CandidateModalProps> = ({
  isOpen,
  onClose,
  candidates,
  drafts,
  onSelect,
  currentText,
  originalText,
}) => {
  if (!isOpen) return null;

  // drafts(라벨/설명 포함)가 오면 우선 사용하고, 아니면 문자열 후보로 폴백.
  const entries: BlockDraft[] =
    drafts && drafts.length > 0
      ? drafts
      : candidates.map((content) => ({ content }));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100"
        >
          <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-gray-700">대체 텍스트 선택</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 rounded-full transition-colors"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          <div className="p-2 max-h-[60vh] overflow-y-auto">
            {entries.length === 0 ? (
              <p className="p-4 text-center text-gray-400 text-sm">
                추천할 대체 텍스트가 없습니다.
              </p>
            ) : (
              entries.map((entry, idx) => {
                const isSelected = entry.content === currentText;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      // 이미 채택된 초안을 다시 누르면 AI 원본으로 되돌린다(스와프).
                      if (isSelected) {
                        onSelect(originalText ?? entry.content, -1);
                      } else {
                        onSelect(entry.content, idx);
                      }
                      onClose();
                    }}
                    className={`w-full text-left p-3 rounded-xl text-sm transition-all flex items-start gap-3 hover:bg-[#5A8FBB]/5 group ${
                      isSelected ? 'bg-blue-50 border-blue-100' : 'bg-white'
                    }`}
                  >
                    <div
                      className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-[#5A8FBB] bg-[#5A8FBB]'
                          : 'border-gray-300 group-hover:border-[#5A8FBB]'
                      }`}
                    >
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {entry.label && (
                        <span className="mb-1 inline-block rounded-md bg-[#5A8FBB]/10 px-2 py-0.5 text-[11px] font-semibold text-[#5A8FBB]">
                          {entry.label}
                        </span>
                      )}
                      <span
                        className={`block whitespace-pre-wrap break-words ${isSelected ? 'text-[#5A8FBB] font-medium' : 'text-gray-600'}`}
                      >
                        {entry.content}
                      </span>
                      {entry.text && (
                        <span className="mt-1 block text-xs text-gray-400">
                          {entry.text}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CandidateModal;
