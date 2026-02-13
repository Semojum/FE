import { useState, useCallback } from 'react';
import { TranslationBlock } from '../types';

export const useTranslationBlocks = (
  initialBlocks: TranslationBlock[] = [],
) => {
  const [blocks, setBlocks] = useState<TranslationBlock[]>(initialBlocks);

  // 1. 텍스트 직접 수정 (타이핑)
  const updateBlock = useCallback((id: string, newText: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, currentText: newText } : block,
      ),
    );
  }, []);

  // 2. 후보군 중 하나를 선택하여 적용 (대체 텍스트 클릭 시)
  const applyCandidate = useCallback((id: string, candidate: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, currentText: candidate } : block,
      ),
    );
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((block) => block.id !== id));
  }, []);

  const addBlock = useCallback((index: number) => {
    const newBlock: TranslationBlock = {
      id: crypto.randomUUID(),
      currentText: '',
      candidates: [], // 빈 후보군
    };
    setBlocks((prev) => {
      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      return newBlocks;
    });
  }, []);

  return {
    blocks,
    setBlocks,
    updateBlock,
    applyCandidate,
    removeBlock,
    addBlock,
  };
};
