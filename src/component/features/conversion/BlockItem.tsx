// component/features/conversion/BlockItem.tsx
import React, { memo, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Trash2, Plus, Sparkles, GripVertical, Code2, Eye } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { TranslationBlock, ConversionTab } from '../../../types'; // ConversionTab 타입 임포트 필요
import CandidateModal from './CandidateModal';
import LatexRenderer from './LatexRenderer';
import BrailleRenderer from './BrailleRenderer'; // [New]

interface BlockItemProps {
  block: TranslationBlock;
  index: number;
  // [New] 현재 활성화된 탭 정보 (렌더링 방식 결정)
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
    mode, // [New]
    onUpdate,
    onApplyCandidate,
    onRemove,
    onAdd,
    onSelect,
    isSelected,
  }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    // 점역 변환일 경우 기본값을 '미리보기 모드(true)'로 설정하여 점자를 바로 보여줌
    const [isPreviewMode, setIsPreviewMode] = useState(mode === '점역 변환');

    const dragControls = useDragControls();

    // 렌더링 헬퍼 함수
    const renderContent = (text: string) => {
      if (mode === '점역 변환') {
        return <BrailleRenderer text={text} />;
      }
      return <LatexRenderer text={text} />;
    };

    return (
      <Reorder.Item
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
          {/* 1. 왼쪽 컨트롤러 (드래그 핸들) */}
          <div className="flex flex-col gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="p-1.5 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing hover:bg-gray-100 rounded-lg touch-none"
            >
              <GripVertical size={16} />
            </div>
            <button
              onClick={() => onAdd(index)}
              className="p-1.5 text-gray-400 hover:text-[#5A8FBB] hover:bg-blue-50 rounded-lg"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* 2. 메인 컨텐츠 */}
          <div className="flex-1 min-w-0">
            {/* 상단 정보: 원본 텍스트 */}
            <div className="flex justify-between items-start mb-2 min-h-[24px]">
              <div
                className={`text-xs px-1 py-0.5 rounded transition-colors max-w-[80%] ${
                  isSelected ? 'text-[#5A8FBB] bg-blue-50/30' : 'text-gray-400'
                }`}
              >
                {/* 원본 텍스트는 항상 Latex/일반 텍스트로 렌더링 (점자가 아님) */}
                {block.originalText ? (
                  <LatexRenderer text={block.originalText} />
                ) : (
                  <span className="opacity-50 italic">원본 텍스트 없음</span>
                )}
              </div>

              {/* 툴바 */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPreviewMode(!isPreviewMode);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  title={isPreviewMode ? '편집 모드로 전환' : '미리보기'}
                >
                  {isPreviewMode ? <Code2 size={14} /> : <Eye size={14} />}
                </button>

                {block.candidates && block.candidates.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsModalOpen(true);
                    }}
                    className="flex items-center gap-1 text-[10px] bg-blue-50 text-[#5A8FBB] px-2 py-0.5 rounded-full hover:bg-[#5A8FBB] hover:text-white transition-colors"
                  >
                    <Sparkles size={10} />
                    <span>추천</span>
                  </button>
                )}
              </div>
            </div>

            {/* 에디터 영역 */}
            <div className="relative min-h-[2.5rem]">
              {isPreviewMode ? (
                // [미리보기 모드] 점자 렌더러 또는 Latex 렌더러 사용
                <div
                  className="w-full p-2 text-gray-800 bg-gray-50/50 rounded-lg border border-transparent min-h-[42px] cursor-text"
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
                // [편집 모드] Textarea (점자의 경우 폰트가 지원되지 않으면 네모로 보일 수 있음. 필요시 폰트 적용)
                <TextareaAutosize
                  value={block.currentText}
                  onFocus={() => onSelect(block.id)}
                  onChange={(e) => onUpdate(block.id, e.target.value)}
                  // 점자 모드일 때 텍스트 영역 글씨를 조금 키움
                  className={`w-full resize-none outline-none bg-transparent p-2 text-gray-800 leading-relaxed rounded-lg focus:bg-white focus:ring-2 focus:ring-[#5A8FBB]/20 focus:shadow-sm transition-all font-mono 
                    ${mode === '점역 변환' ? 'text-xl tracking-wider' : 'text-sm'}`}
                  placeholder="텍스트를 입력하세요..."
                  minRows={1}
                />
              )}
            </div>
          </div>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-2">
            <button
              onClick={() => onRemove(block.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
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
