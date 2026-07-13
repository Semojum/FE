// component/features/conversion/BlockItem.tsx
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Trash2,
  Plus,
  Sparkles,
  GripVertical,
  Code2,
  Eye,
  BookOpen,
  Info,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { TranslationBlock, ConversionTab, TABS } from '../../../types';
import CandidateModal from './CandidateModal';
import LatexRenderer from './LatexRenderer';
import BrailleRenderer from './BrailleRenderer';
import HighlightedTextarea from './HighlightedTextarea.tsx';
import { useTextHighlight } from '../../../hooks/UseTextHighLight.tsx';

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
  // 블록 편집을 서버에 저장. 포커스가 블록을 벗어나거나 초안을 선택할 때 호출.
  onPersist?: (id: string, text: string) => void;
  // 서버 저장 상태 — 'saving' 저장 중 / 'error' 실패(재시도 표시)
  saveState?: 'saving' | 'error';
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
    onPersist,
    saveState,
  }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPreviewMode, setIsPreviewMode] = useState(mode === TABS.BRAILLE);
    // 이 블록에 적용된 점역 규정(rule_trail) 패널 표시 여부
    const [showRules, setShowRules] = useState(false);
    const dragControls = useDragControls();

    const ruleTrail = block.ruleTrail ?? [];

    const itemRef = useRef<HTMLLIElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null); // ✅ 커서 제어용 Ref
    const pressedKeys = useRef<Set<string>>(new Set()); // ✅ 눌린 키 추적용 Set

    useEffect(() => {
      if (isSelected && itemRef.current) {
        itemRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, [isSelected]);

    const renderContent = (text: string) => {
      if (mode === TABS.BRAILLE || mode === TABS.INTEGRATED) {
        return <BrailleRenderer text={text} />;
      }
      return <LatexRenderer text={text} />;
    };

    const highlightedContent = useTextHighlight(block.currentText);

    // 2. renderHighlight 콜백에 바로 적용
    const renderHighlight = useCallback(() => {
      return highlightedContent;
    }, [highlightedContent]);

    // ─────────────────────────────────────────────────────────────
    // ✅ [New] 점자 직접 입력 (표준 Perkins 6점자: SDF JKL) 로직
    // ─────────────────────────────────────────────────────────────

    // 점자 키 매핑 (물리 키보드 기준 - 한/영 상태 무관)
    const BRAILLE_DOT_MAP: Record<string, number> = {
      KeyF: 1, // 1점
      KeyD: 2, // 2점
      KeyS: 4, // 3점
      KeyJ: 8, // 4점 (정상적인 6점자 비트 값으로 수정 완료)
      KeyK: 16, // 5점
      KeyL: 32, // 6점
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mode !== TABS.BRAILLE) return;

      const dotValue = BRAILLE_DOT_MAP[e.code];
      if (dotValue) {
        e.preventDefault(); // 기본 알파벳/한글 입력 차단
        pressedKeys.current.add(e.code); // 눌린 키 기록
      }
    };

    const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mode !== TABS.BRAILLE) return;

      const dotValue = BRAILLE_DOT_MAP[e.code];
      if (dotValue) {
        e.preventDefault();

        // 눌린 키가 하나라도 있을 때 떼면(Release) 글자 하나 완성
        if (pressedKeys.current.size > 0) {
          let dotSum = 0;
          pressedKeys.current.forEach((code) => {
            dotSum += BRAILLE_DOT_MAP[code];
          });

          // 점자 유니코드 조합 (U+2800 이 빈 칸, 거기에 합산)
          const brailleChar = String.fromCharCode(0x2800 + dotSum);

          // 현재 커서 위치에 점자 삽입
          const textarea = textareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentText = block.currentText;

            const newText =
              currentText.substring(0, start) +
              brailleChar +
              currentText.substring(end);

            onUpdate(block.id, newText);

            // React가 렌더링을 마친 후 커서를 새로 들어간 글자 뒤로 이동
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = start + 1;
            }, 0);
          }

          // 다음 입력을 위해 누적된 키 초기화
          pressedKeys.current.clear();
        }
      }
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
            {/* 점역사주(tn_text): 시각 요소를 AI가 한글로 설명한 원문 — 점역 방향 판단용 */}
            {block.tnText && (
              <p className="mb-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-xs text-amber-800">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{block.tnText}</span>
              </p>
            )}
            <div className="relative min-h-[2.5rem]">
              {isPreviewMode ? (
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
                <HighlightedTextarea
                  ref={textareaRef} // 🚨 주의: HighlightedTextarea가 내부 Textarea로 forwardRef를 넘겨주도록 수정 필요할 수 있음
                  value={block.currentText}
                  renderHighlight={renderHighlight} // ✅ 하이라이트된 Node 전달
                  onFocus={() => onSelect(block.id)}
                  onChange={(e) => onUpdate(block.id, e.target.value)}
                  onBlur={() => onPersist?.(block.id, block.currentText)}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  className={
                    mode === TABS.BRAILLE ? 'text-xl tracking-wider' : 'text-sm'
                  }
                  placeholder={
                    mode === TABS.BRAILLE
                      ? 'SDF JKL 키를 동시에 눌러 점자를 입력하세요...'
                      : '텍스트를 입력하세요...'
                  }
                  minRows={1}
                />
              )}
            </div>

            {/* 서버 저장 상태 — 저장 중이거나 실패했을 때만 표시 */}
            {saveState === 'saving' && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                <Loader2 size={11} className="animate-spin" /> 저장 중...
              </p>
            )}
            {saveState === 'error' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPersist?.(block.id, block.currentText);
                }}
                className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-500 hover:underline"
              >
                <AlertCircle size={11} /> 저장 실패 — 다시 시도
              </button>
            )}

            {/* 적용된 점역 규정(rule_trail) 목록 */}
            {showRules && ruleTrail.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 rounded-lg border border-[#5A8FBB]/20 bg-[#5A8FBB]/5 p-2.5">
                {ruleTrail.map((rule, idx) => (
                  <li key={idx} className="text-xs leading-relaxed">
                    <span className="font-semibold text-[#407FAC]">
                      {rule.rule_id} {rule.title}
                    </span>
                    {rule.priority === 'secondary' && (
                      <span className="ml-1.5 rounded bg-gray-200 px-1 py-0.5 text-[10px] text-gray-500">
                        보조
                      </span>
                    )}
                    <span className="block text-gray-600">{rule.excerpt}</span>
                    {rule.source && (
                      <span className="block text-[10px] text-gray-400">
                        {rule.source}
                        {rule.section ? ` §${rule.section}` : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 3. 오른쪽 컨트롤러 */}
          <div className="flex flex-col gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity items-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsPreviewMode(!isPreviewMode);
              }}
              className="p-1.5 text-gray-400 hover:text-[#5A8FBB] hover:bg-blue-50 rounded-lg transition-colors"
              title={isPreviewMode ? '편집 모드로 전환' : '렌더링 미리보기'}
            >
              {isPreviewMode ? <Code2 size={16} /> : <Eye size={16} />}
            </button>

            {ruleTrail.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRules((v) => !v);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  showRules
                    ? 'text-[#407FAC] bg-blue-50'
                    : 'text-gray-400 hover:text-[#407FAC] hover:bg-blue-50'
                }`}
                title="적용된 점역 규정 보기"
              >
                <BookOpen size={16} />
              </button>
            )}

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
          drafts={block.drafts}
          currentText={block.currentText}
          onSelect={(text) => {
            onApplyCandidate(block.id, text);
            // 초안 선택은 blur를 거치지 않으므로 즉시 서버에 저장한다.
            onPersist?.(block.id, text);
          }}
        />
      </Reorder.Item>
    );
  },
);

BlockItem.displayName = 'BlockItem';
export default BlockItem;
