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

  // 전체 블록을 한 번에 교체 (팝업 동기화: 메인 스냅샷 적용용).
  // 갱신 함수도 받는다 — 지금 화면에 있는 것 위에 합쳐야 하는 호출부(마이페이지
  // 복원의 나머지 쪽 채우기)가 **그때의** 상태를 봐야 하기 때문이다. 값으로 받아
  // 넘기면 그 값을 만든 시점의 상태가 굳어, 다른 작업을 연 뒤 늦게 도착한 채우기가
  // 이전 작업의 쪽들을 되살렸다(2026-08-27 인수시험).
  const setAllBlocks = useCallback(
    (all: React.SetStateAction<Record<number, TranslationBlock[]>>) => {
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

  // index 뒤에 빈 블록을 추가하고 그 로컬 ID를 반환한다.
  // 반환된 ID로 호출부가 서버 생성(POST)을 걸고, 발급받은 요소 ID로 교체한다.
  const addBlock = useCallback((page: number, index: number): string => {
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
    return newBlock.id;
  }, []);

  // 삭제 롤백용 — 서버 삭제(DELETE)가 실패했을 때 원래 자리에 되돌린다.
  const insertBlockAt = useCallback(
    (page: number, index: number, block: TranslationBlock) => {
      setBlocksByPage((prev) => {
        const pageBlocks = [...(prev[page] || [])];
        if (pageBlocks.some((b) => b.id === block.id)) return prev; // 이미 있으면 무시
        pageBlocks.splice(Math.max(0, index), 0, block);
        return { ...prev, [page]: pageBlocks };
      });
    },
    [],
  );

  // 로컬 임시 ID(추가 직후)를 서버가 발급한 요소 ID로 교체.
  // 이후 수정/삭제/순서변경 API가 이 ID를 사용한다.
  const replaceBlockId = useCallback(
    (page: number, oldId: string, newId: string) => {
      setBlocksByPage((prev) => ({
        ...prev,
        [page]: (prev[page] || []).map((block) =>
          block.id === oldId ? { ...block, id: newId } : block,
        ),
      }));
    },
    [],
  );

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
    insertBlockAt,
    replaceBlockId,
    reorderBlocks,
    resetAllBlocks,
  };
};
