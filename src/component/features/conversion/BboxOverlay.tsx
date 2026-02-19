import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BoundingBox, ImageResolution } from '../../../types';

interface BBoxOverlayProps {
  bboxes: BoundingBox[]; // 전체 박스 리스트
  selectedId: string | null; // 현재 선택된 블록 ID
  originalResolution: ImageResolution; // 원본 이미지 해상도
  onBlockClick?: (id: string) => void; // ✅ [New] 클릭 핸들러 추가
}

const BBoxOverlay: React.FC<BBoxOverlayProps> = ({
  bboxes,
  selectedId,
  originalResolution,
  onBlockClick,
}) => {
  // 해상도 정보가 없으면 렌더링하지 않음
  if (
    !bboxes ||
    bboxes.length === 0 ||
    !originalResolution.width ||
    !originalResolution.height
  ) {
    return null;
  }

  return (
    // 부모 컨테이너는 이벤트를 통과시켜야 하므로 pointer-events-none
    <div className="absolute inset-0 pointer-events-none z-10">
      <AnimatePresence>
        {bboxes.map((box) => {
          const isSelected = box.id === selectedId;

          // 좌표를 % 단위로 변환
          const style = {
            left: `${(box.x / originalResolution.width) * 100}%`,
            top: `${(box.y / originalResolution.height) * 100}%`,
            width: `${((box.x2 - box.x) / originalResolution.width) * 100}%`,
            height: `${((box.y2 - box.y) / originalResolution.height) * 100}%`,
          };

          return (
            <motion.div
              key={box.id}
              layoutId={isSelected ? 'active-bbox' : undefined} // 선택된 요소만 레이아웃 애니메이션
              initial={false}
              onClick={(e) => {
                e.stopPropagation(); // 이벤트 버블링 방지
                onBlockClick?.(box.id); // ✅ 클릭 시 ID 전달
              }}
              style={style}
              // ✅ 중요: pointer-events-auto를 줘서 이 박스는 클릭 가능하게 만듦
              className={`absolute border-2 rounded-sm cursor-pointer pointer-events-auto transition-all duration-200 
                ${
                  isSelected
                    ? 'border-[#5A8FBB] bg-[#5A8FBB]/20 shadow-[0_0_10px_rgba(90,143,187,0.5)] z-20 scale-[1.02]' // 선택됨
                    : 'border-transparent hover:border-[#5A8FBB]/40 hover:bg-[#5A8FBB]/5 z-10' // 선택 안됨 (호버 효과만)
                }
              `}
              // 선택된 박스가 나타날 때 약간의 애니메이션 효과
              animate={
                isSelected
                  ? { opacity: 1, scale: 1.02 }
                  : { opacity: 1, scale: 1 }
              }
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default BBoxOverlay;
