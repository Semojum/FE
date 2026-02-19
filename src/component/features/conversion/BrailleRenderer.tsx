// component/features/conversion/BrailleRenderer.tsx
import React, { memo } from 'react';

interface Props {
  text: string;
  className?: string;
}

const BrailleRenderer: React.FC<Props> = memo(({ text, className = '' }) => {
  // 점자 유니코드 범위 체크 (U+2800 ~ U+28FF)
  // 텍스트에 점자가 포함되어 있는지 확인하여 스타일 분기 가능

  return (
    <div
      className={`font-sans text-2xl md:text-3xl tracking-widest leading-relaxed text-gray-800 break-words ${className}`}
      style={{
        fontFeatureSettings: '"tnum"', // 등폭 숫자 처리 (폰트 지원 시)
        fontVariantNumeric: 'tabular-nums',
      }}
      aria-label="점자 텍스트"
    >
      {text}
    </div>
  );
});

export default BrailleRenderer;
