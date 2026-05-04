// hooks/useTranslationBlocks.ts
import { useState, useCallback } from 'react';
import { TranslationBlock } from '../types';

export const useTranslationBlocks = () => {
  // pageNumber를 Key로, 해당 페이지의 블록 배열을 Value로 가집니다.
  const [blocksByPage, setBlocksByPage] = useState<
    Record<number, TranslationBlock[]>
  >({});

  // 특정 페이지의 블록 가져오기
  const getBlocks = useCallback(
    (page: number) => blocksByPage[page] || [],
    [blocksByPage],
  );

  // 특정 페이지의 전체 블록 세팅 (API 로드 시)
  const setBlocksForPage = useCallback(
    (page: number, newBlocks: TranslationBlock[]) => {
      setBlocksByPage((prev) => ({ ...prev, [page]: newBlocks }));
    },
    [],
  );

  // 전체 블록을 한 번에 교체 (팝업 동기화: 메인 스냅샷 적용용)
  const setAllBlocks = useCallback(
    (all: Record<number, TranslationBlock[]>) => {
      setBlocksByPage(all);
    },
    [],
  );

  // 1. 텍스트 직접 수정
  const updateBlock = useCallback(
    (page: number, id: string, newText: string) => {
      setBlocksByPage((prev) => ({
        ...prev,
        [page]: (prev[page] || []).map((block) =>
          block.id === id ? { ...block, currentText: newText } : block,
        ),
      }));
    },
    [],
  );

  // 2. 대체 텍스트 적용
  const applyCandidate = useCallback(
    (page: number, id: string, candidate: string) => {
      setBlocksByPage((prev) => ({
        ...prev,
        [page]: (prev[page] || []).map((block) =>
          block.id === id ? { ...block, currentText: candidate } : block,
        ),
      }));
    },
    [],
  );

  const removeBlock = useCallback((page: number, id: string) => {
    setBlocksByPage((prev) => ({
      ...prev,
      [page]: (prev[page] || []).filter((block) => block.id !== id),
    }));
  }, []);

  const addBlock = useCallback((page: number, index: number) => {
    const newBlock: TranslationBlock = {
      id: crypto.randomUUID(),
      currentText: '',
      candidates: [],
    };
    setBlocksByPage((prev) => {
      const pageBlocks = [...(prev[page] || [])];
      pageBlocks.splice(index + 1, 0, newBlock);
      return { ...prev, [page]: pageBlocks };
    });
  }, []);

  // Reorder.Group용 순서 업데이트
  const reorderBlocks = useCallback(
    (page: number, reordered: TranslationBlock[]) => {
      setBlocksByPage((prev) => ({ ...prev, [page]: reordered }));
    },
    [],
  );

  // 탭 변경이나 파일 초기화 시 전체 리셋
  const resetAllBlocks = useCallback(() => setBlocksByPage({}), []);

  return {
    blocksByPage,
    getBlocks,
    setBlocksForPage,
    setAllBlocks,
    updateBlock,
    applyCandidate,
    removeBlock,
    addBlock,
    reorderBlocks,
    resetAllBlocks,
  };
};
