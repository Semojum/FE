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
  setImgResolution: Dispatch<SetStateAction<ImageResolution>>;
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

      // 해상도는 현재 보고 있는 페이지 것으로 맞춘다(이미지 모드 한정).
      //
      // 다만 **아직 하나도 못 받았으면** 어느 쪽 것이든 받아 둔다. 예전에는 보고 있는
      // 쪽과 도착한 쪽이 같을 때만 저장해서, 첫 쪽 결과에 image_resolution이 없는
      // 문서에서는 끝내 0×0으로 남았다 — BboxOverlay는 해상도가 없으면 아무것도
      // 그리지 않으므로 원본에 상자가 안 뜨고 클릭도 되지 않았다(2026-09-02 QA).
      if (mapped.imgResolution) {
        const res = mapped.imgResolution;
        setImgResolution((prev) =>
          page === currentPage || !prev.width || !prev.height ? res : prev,
        );
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
