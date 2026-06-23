import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { StreamPageData } from '../types/apiTypes';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from '../types';
import { mapPageResult } from '../utils/mapPageResult';

interface UsePageStreamHandlerOptions {
  activeTab: ConversionTab;
  currentPage: number;
  totalPages: number;
  setTotalPages: (n: number) => void;
  setImgResolution: (res: ImageResolution) => void;
  setBboxDataByPage: Dispatch<SetStateAction<Record<number, BoundingBox[]>>>;
  setOriginalTextsByPage: Dispatch<
    SetStateAction<Record<number, OriginalTextBlock[]>>
  >;
  setBlocksForPage: (page: number, blocks: TranslationBlock[]) => void;
}

export const usePageStreamHandler = ({
  activeTab,
  currentPage,
  totalPages,
  setTotalPages,
  setImgResolution,
  setBboxDataByPage,
  setOriginalTextsByPage,
  setBlocksForPage,
}: UsePageStreamHandlerOptions) => {
  return useCallback(
    (data: StreamPageData) => {
      const page = data.page_no;
      const result = data.result ?? {};

      setTotalPages(Math.max(totalPages, page));

      const mapped = mapPageResult(activeTab, result);

      // 해상도는 현재 보고 있는 페이지에 대해서만 갱신한다(이미지 모드 한정).
      if (mapped.imgResolution && page === currentPage) {
        setImgResolution(mapped.imgResolution);
      }
      setBboxDataByPage((prev) => ({ ...prev, [page]: mapped.bboxes }));
      setOriginalTextsByPage((prev) => ({
        ...prev,
        [page]: mapped.originalTexts,
      }));
      setBlocksForPage(page, mapped.blocks);
    },
    [
      activeTab,
      currentPage,
      totalPages,
      setTotalPages,
      setImgResolution,
      setBboxDataByPage,
      setOriginalTextsByPage,
      setBlocksForPage,
    ],
  );
};
