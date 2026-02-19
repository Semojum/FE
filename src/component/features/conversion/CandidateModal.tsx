import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';

interface CandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: string[];
  onSelect: (text: string) => void;
  currentText: string;
}

const CandidateModal: React.FC<CandidateModalProps> = ({
  isOpen,
  onClose,
  candidates,
  onSelect,
  currentText,
}) => {
  if (!isOpen) return null;

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
            {candidates.length === 0 ? (
              <p className="p-4 text-center text-gray-400 text-sm">
                추천할 대체 텍스트가 없습니다.
              </p>
            ) : (
              candidates.map((candidate, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onSelect(candidate);
                    onClose();
                  }}
                  className={`w-full text-left p-3 rounded-xl text-sm transition-all flex items-start gap-3 hover:bg-[#5A8FBB]/5 group ${
                    candidate === currentText
                      ? 'bg-blue-50 border-blue-100'
                      : 'bg-white'
                  }`}
                >
                  <div
                    className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      candidate === currentText
                        ? 'border-[#5A8FBB] bg-[#5A8FBB]'
                        : 'border-gray-300 group-hover:border-[#5A8FBB]'
                    }`}
                  >
                    {candidate === currentText && (
                      <Check size={10} className="text-white" />
                    )}
                  </div>
                  <span
                    className={`${candidate === currentText ? 'text-[#5A8FBB] font-medium' : 'text-gray-600'}`}
                  >
                    {candidate}
                  </span>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CandidateModal;
