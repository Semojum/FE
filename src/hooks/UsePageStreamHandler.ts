import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { StreamPageData } from '../types/apiTypes';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TABS,
  TranslationBlock,
} from '../types';

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

const toArray = (val: string[] | string | undefined): string[] => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

const mapBoundingBoxes = (
  list: StreamPageData['bounding_box_list'],
): BoundingBox[] =>
  (list || []).map((b) => ({
    id: String(b.id),
    x: b.x,
    y: b.y,
    x2: b.x2,
    y2: b.y2,
  }));

const mapOriginalTexts = (
  list: StreamPageData['text_list'],
): OriginalTextBlock[] =>
  (list || []).map((t) => {
    const contentList = toArray(t.contents);
    return { id: String(t.id), content: contentList[0] || '' };
  });

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
      const page = data.page_number;

      setTotalPages(Math.max(totalPages, page));

      if (data.image_resolution && page === currentPage) {
        setImgResolution(data.image_resolution);
      }

      // [CASE C] 통합 변환 모드
      if (activeTab === TABS.INTEGRATED) {
        const mappedBBoxes = mapBoundingBoxes(data.bounding_box_list);
        setBboxDataByPage((prev) => ({ ...prev, [page]: mappedBBoxes }));
        setOriginalTextsByPage((prev) => ({ ...prev, [page]: [] }));

        const newBlocks = (data.braille_text_list || []).map((brailleItem) => {
          const matchedBBox = mappedBBoxes.find(
            (b) => String(b.id) === String(brailleItem.id),
          );
          const brailleContentList = toArray(brailleItem.contents);
          return {
            id: String(brailleItem.id),
            originalText: '',
            currentText: brailleContentList[0] || '',
            candidates: brailleContentList.length > 1 ? brailleContentList : [],
            bbox: matchedBBox,
          };
        });

        setBlocksForPage(page, newBlocks);
        return;
      }

      // [CASE B] 점역 변환 모드 (braille_text_list 존재)
      if (data.braille_text_list && data.braille_text_list.length > 0) {
        const mappedOriginalTexts = mapOriginalTexts(data.text_list);
        setOriginalTextsByPage((prev) => ({
          ...prev,
          [page]: mappedOriginalTexts,
        }));

        const newBlocks = data.braille_text_list.map((brailleItem) => {
          const originalItem = (data.text_list || []).find(
            (t) => String(t.id) === String(brailleItem.id),
          );
          const originalContentList = toArray(originalItem?.contents);
          const brailleContentList = toArray(brailleItem.contents);

          return {
            id: String(brailleItem.id),
            originalText: originalContentList[0] || '',
            currentText: brailleContentList[0] || '',
            candidates: brailleContentList.length > 1 ? brailleContentList : [],
            bbox: undefined,
          };
        });

        setBlocksForPage(page, newBlocks);
        return;
      }

      // [CASE A] OCR 모드
      const mappedBBoxes = mapBoundingBoxes(data.bounding_box_list);
      setBboxDataByPage((prev) => ({ ...prev, [page]: mappedBBoxes }));

      const mappedOriginalTexts = mapOriginalTexts(data.text_list);
      setOriginalTextsByPage((prev) => ({
        ...prev,
        [page]: mappedOriginalTexts,
      }));

      const newBlocks = (data.text_list || []).map((item) => {
        const matchedBBox = mappedBBoxes.find(
          (b) => String(b.id) === String(item.id),
        );
        const contentList = toArray(item.contents);
        return {
          id: String(item.id),
          originalText: contentList[0] || '',
          currentText: contentList[0] || '',
          candidates: contentList.length > 1 ? contentList : [],
          bbox: matchedBBox,
        };
      });
      setBlocksForPage(page, newBlocks);
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
