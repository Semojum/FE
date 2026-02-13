import React, { memo, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Trash2, Plus, Sparkles, GripVertical } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion'; // Reorder, useDragControls 추가
import { TranslationBlock } from '../../../types';
import CandidateModal from './CandidateModal';

interface BlockItemProps {
  block: TranslationBlock;
  index: number;
  onUpdate: (id: string, text: string) => void;
  onApplyCandidate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onAdd: (index: number) => void;
  onSelect: (id: string) => void; // 선택 핸들러 추가
  isSelected: boolean; // 선택 상태 스타일링용
}

const BlockItem: React.FC<BlockItemProps> = memo(
  ({ block, index, onUpdate, onApplyCandidate, onRemove, onAdd, onSelect, isSelected}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    // 드래그 제어를 위한 훅
    const dragControls = useDragControls();

    return (
      <Reorder.Item
        value={block}
        id={block.id}
        dragListener={false} // 텍스트 선택을 방해하지 않도록 기본 드래그 비활성화
        dragControls={dragControls} // 핸들을 통해서만 드래그 가능하게 설정
        onPointerDown={() => onSelect(block.id)}
        className={`relative mb-2 transition-all duration-200 ${
          isSelected ? 'ring-2 ring-[#5A8FBB] ring-offset-2 z-10' : ''
        }`}
        whileDrag={{
          scale: 1.02,
          zIndex: 10,
          boxShadow: '0 5px 15px rgba(0,0,0,0.1)',
        }} // 드래그 중 효과
      >
        <div className="group relative flex items-start gap-2 p-3 bg-white hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-200/60 select-none md:select-auto">
          {/* 왼쪽 컨트롤러 영역 */}
          <div className="flex flex-col gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* 드래그 핸들 (Grip) */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="p-1.5 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing hover:bg-gray-100 rounded-lg touch-none"
              title="순서 변경"
            >
              <GripVertical size={16} />
            </div>

            {/* 추가 버튼 */}
            <button
              onClick={() => onAdd(index)}
              className="p-1.5 text-gray-400 hover:text-[#5A8FBB] hover:bg-blue-50 rounded-lg transition-colors"
              title="새 블록 추가"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* 메인 에디터 영역 */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1.5">
              {block.originalText && (
                <p className="text-xs text-gray-400 font-medium px-1 truncate select-none">
                  {block.originalText}
                </p>
              )}

              {block.candidates && block.candidates.length > 0 && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-1 text-[10px] bg-blue-50 text-[#5A8FBB] px-2 py-0.5 rounded-full hover:bg-[#5A8FBB] hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Sparkles size={10} />
                  <span>대체 텍스트</span>
                </button>
              )}
            </div>

            <TextareaAutosize
              value={block.currentText}
              onFocus={() => onSelect(block.id) }
              onChange={(e) => onUpdate(block.id, e.target.value)}
              className="w-full resize-none outline-none bg-transparent p-2 text-gray-800 leading-relaxed rounded-lg focus:bg-white focus:ring-2 focus:ring-[#5A8FBB]/20 focus:shadow-sm transition-all"
              placeholder="텍스트를 입력하세요..."
              minRows={1}
            />
          </div>

          {/* 오른쪽 컨트롤러: 삭제 버튼 */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-2">
            <button
              onClick={() => onRemove(block.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="블록 삭제"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <CandidateModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          candidates={block.candidates}
          currentText={block.currentText}
          onSelect={(text) => onApplyCandidate(block.id, text)}
        />
      </Reorder.Item>
    );
  },
);

BlockItem.displayName = 'BlockItem';
export default BlockItem;
