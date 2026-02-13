import { useState, useCallback } from 'react';
import { TranslationBlock } from '../types';

export const useTranslationBlocks = (
  initialBlocks: TranslationBlock[] = [],
) => {
  const [blocks, setBlocks] = useState<TranslationBlock[]>(initialBlocks);

  // 특정 블록의 텍스트 업데이트 (useCallback으로 참조 유지)
  const updateBlock = useCallback((id: string, newText: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, translatedText: newText } : block,
      ),
    );
  }, []);

  // 블록 삭제
  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((block) => block.id !== id));
  }, []);

  // 블록 추가 (원하는 위치에 추가하는 기능 등 확장 가능)
  const addBlock = useCallback((index: number) => {
    const newBlock: TranslationBlock = {
      id: crypto.randomUUID(), // 브라우저 내장 UUID 생성기 사용
      translatedText: '',
    };
    setBlocks((prev) => {
      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      return newBlocks;
    });
  }, []);

  return { blocks, setBlocks, updateBlock, removeBlock, addBlock };
};
