// component/features/conversion/BlockItem.tsx
import React, { memo, useEffect, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Trash2, Plus, Sparkles, GripVertical, Code2, Eye } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { TranslationBlock, ConversionTab } from '../../../types';
import CandidateModal from './CandidateModal';
import LatexRenderer from './LatexRenderer';
import BrailleRenderer from './BrailleRenderer';

interface BlockItemProps {
  block: TranslationBlock;
  index: number;
  mode: ConversionTab;
  onUpdate: (id: string, text: string) => void;
  onApplyCandidate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onAdd: (index: number) => void;
  onSelect: (id: string) => void;
  isSelected: boolean;
}

const BlockItem: React.FC<BlockItemProps> = memo(
  ({
    block,
    index,
    mode,
    onUpdate,
    onApplyCandidate,
    onRemove,
    onAdd,
    onSelect,
    isSelected,
  }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    // ✅ 모드에 따라 초기 미리보기 상태를 다르게 설정 (선택 사항)
    // 점역 모드면 기본적으로 미리보기를 켜고, 그 외(OCR)면 편집 모드를 기본으로 합니다.
    const [isPreviewMode, setIsPreviewMode] = useState(mode === '점역 변환');

    const dragControls = useDragControls();
    const itemRef = useRef<HTMLLIElement>(null);

    // isSelected가 true가 되면 해당 요소로 스크롤 이동
    useEffect(() => {
      if (isSelected && itemRef.current) {
        itemRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, [isSelected]);

    // ✅ 렌더링 함수: 텍스트를 받아서 모드에 맞게 LaTeX 또는 점자로 변환
    const renderContent = (text: string) => {
      if (mode === '점역 변환') {
        return <BrailleRenderer text={text} />;
      }
      return <LatexRenderer text={text} />;
    };

    return (
      <Reorder.Item
        ref={itemRef}
        value={block}
        id={block.id}
        dragListener={false}
        dragControls={dragControls}
        onPointerDown={() => onSelect(block.id)}
        className={`relative mb-2 transition-all duration-200 ${
          isSelected ? 'z-10' : 'z-0'
        }`}
        whileDrag={{
          scale: 1.02,
          zIndex: 20,
          boxShadow: '0 5px 15px rgba(0,0,0,0.1)',
        }}
      >
        <div
          className={`group relative flex items-start gap-2 p-3 bg-white rounded-xl transition-all border select-none md:select-auto
            ${
              isSelected
                ? 'border-[#5A8FBB] ring-2 ring-[#5A8FBB]/10 shadow-md'
                : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
            }
          `}
        >
          {/* 1. 왼쪽 컨트롤러 */}
          <div className="flex flex-col gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="p-1.5 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing hover:bg-gray-100 rounded-lg touch-none"
              title="순서 변경"
            >
              <GripVertical size={16} />
            </div>
            <button
              onClick={() => onAdd(index)}
              className="p-1.5 text-gray-400 hover:text-[#5A8FBB] hover:bg-blue-50 rounded-lg transition-colors"
              title="새 블록 추가"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* 2. 메인 컨텐츠 */}
          <div className="flex-1 min-w-0 mt-1">
            <div className="relative min-h-[2.5rem]">
              {/* ✅ 미리보기 모드일 때 렌더링 */}
              {isPreviewMode ? (
                <div
                  className="w-full p-2 text-gray-800 bg-gray-50/50 rounded-lg border border-transparent min-h-[42px] cursor-text"
                  // 텍스트 영역을 클릭하면 다시 편집 모드로 돌아갑니다.
                  onClick={() => setIsPreviewMode(false)}
                >
                  {block.currentText ? (
                    renderContent(block.currentText)
                  ) : (
                    <span className="text-gray-400 italic">
                      내용을 입력하세요...
                    </span>
                  )}
                </div>
              ) : (
                /* ✅ 편집 모드일 때 텍스트 입력창 렌더링 */
                <TextareaAutosize
                  value={block.currentText}
                  onFocus={() => onSelect(block.id)}
                  onChange={(e) => onUpdate(block.id, e.target.value)}
                  className={`w-full resize-none outline-none bg-transparent p-2 text-gray-800 leading-relaxed rounded-lg focus:bg-white focus:ring-2 focus:ring-[#5A8FBB]/20 focus:shadow-sm transition-all font-mono 
                    ${mode === '점역 변환' ? 'text-xl tracking-wider' : 'text-sm'}`}
                  placeholder="텍스트를 입력하세요..."
                  minRows={1}
                />
              )}
            </div>
          </div>

          {/* 3. 오른쪽 컨트롤러 */}
          <div className="flex flex-col gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity items-center">
            {/* ✅ 미리보기/편집 토글 버튼 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsPreviewMode(!isPreviewMode); // 상태 반전
              }}
              className="p-1.5 text-gray-400 hover:text-[#5A8FBB] hover:bg-blue-50 rounded-lg transition-colors"
              title={isPreviewMode ? '편집 모드로 전환' : '렌더링 미리보기'}
            >
              {isPreviewMode ? <Code2 size={16} /> : <Eye size={16} />}
            </button>

            {/* 후보 추천 모달 */}
            {block.candidates && block.candidates.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModalOpen(true);
                }}
                className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors relative"
                title="대체 텍스트 추천 보기"
              >
                <Sparkles size={16} />
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-400 rounded-full border border-white"></span>
              </button>
            )}

            {/* 삭제 버튼 */}
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
