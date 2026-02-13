import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BoundingBox, ImageResolution } from '../../../types';

interface BBoxOverlayProps {
  bboxes: BoundingBox[]; // 전체 박스 리스트 (필요 시 전체 표시)
  selectedId: string | null; // 현재 선택된 블록 ID
  originalResolution: ImageResolution; // 원본 이미지 해상도 (JSON의 image_resolution)
}

const BBoxOverlay: React.FC<BBoxOverlayProps> = ({
  bboxes,
  selectedId,
  originalResolution,
}) => {
  // 현재 선택된 ID에 해당하는 BBox 찾기
  const activeBBox = useMemo(
    () => bboxes.find((box) => box.id === selectedId),
    [bboxes, selectedId],
  );

  if (!activeBBox || !originalResolution.width || !originalResolution.height) {
    return null;
  }

  // 좌표를 % 단위로 변환 (반응형 대응을 위해 CSS % 사용)
  const getStyle = (box: BoundingBox) => {
    const { x, y, x2, y2 } = box;
    const width = x2 - x;
    const height = y2 - y;

    return {
      left: `${(x / originalResolution.width) * 100}%`,
      top: `${(y / originalResolution.height) * 100}%`,
      width: `${(width / originalResolution.width) * 100}%`,
      height: `${(height / originalResolution.height) * 100}%`,
    };
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <AnimatePresence>
        {activeBBox && (
          <motion.div
            layoutId="active-bbox"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: 1,
              scale: 1,
              borderColor: '#5A8FBB',
              backgroundColor: 'rgba(90, 143, 187, 0.1)',
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={getStyle(activeBBox)}
            className="absolute border-2 border-[#5A8FBB] rounded-sm shadow-[0_0_10px_rgba(90,143,187,0.3)]"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default BBoxOverlay;
