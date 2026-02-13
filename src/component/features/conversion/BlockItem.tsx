import React, { memo } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Trash2, Plus } from 'lucide-react';
import { TranslationBlock } from '../../../types';

interface BlockItemProps {
  block: TranslationBlock;
  index: number;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onAdd: (index: number) => void;
}

// React.memo를 통한 불필요한 리렌더링 방지
const BlockItem: React.FC<BlockItemProps> = memo(
  ({ block, index, onUpdate, onRemove, onAdd }) => {
    return (
      <div className="group relative flex items-start gap-2 p-2 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100">
        {/* 블록 왼쪽 컨트롤러 (호버 시 표시) */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
          <button
            onClick={() => onAdd(index)}
            className="p-1 text-gray-400 hover:text-[#5A8FBB] hover:bg-blue-50 rounded"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* 에디터 영역 */}
        <div className="flex-1">
          {block.originalText && (
            <p className="text-xs text-gray-400 mb-1 px-2">
              {block.originalText}
            </p>
          )}
          <TextareaAutosize
            value={block.translatedText}
            onChange={(e) => onUpdate(block.id, e.target.value)}
            className="w-full resize-none outline-none bg-transparent p-2 text-gray-700 leading-relaxed rounded-lg focus:bg-white focus:ring-2 focus:ring-[#5A8FBB]/20 transition-all"
            placeholder="텍스트를 입력하세요..."
            minRows={1}
          />
        </div>

        {/* 삭제 버튼 */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1">
          <button
            onClick={() => onRemove(block.id)}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  },
);

// displayName 설정 (디버깅 용이)
BlockItem.displayName = 'BlockItem';
export default BlockItem;
