import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { StreamPageData, BoundingBoxDto } from '../types/apiTypes';
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
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
};

// text_list 항목은 모드에 따라 contents(배열, mode a) 또는 content(문자열, mode b)를 가진다.
const itemContents = (item: {
  contents?: string[];
  content?: string | string[];
}): string[] => toArray(item.contents ?? item.content);

const mapBoundingBoxes = (list: BoundingBoxDto[] | undefined): BoundingBox[] =>
  (list || []).map((b) => ({
    id: String(b.id),
    x: b.x,
    y: b.y,
    x2: b.x2,
    y2: b.y2,
  }));

const mapOriginalTexts = (
  list: StreamPageData['result']['text_list'],
): OriginalTextBlock[] =>
  (list || []).map((t) => ({
    id: String(t.id),
    content: itemContents(t)[0] || '',
  }));

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

      if (result.image_resolution && page === currentPage) {
        setImgResolution(result.image_resolution);
      }

      // [CASE C] 통합 변환 (이미지 → 점자): braille_text_list + bbox
      if (activeTab === TABS.INTEGRATED) {
        const mappedBBoxes = mapBoundingBoxes(result.bounding_box_list);
        setBboxDataByPage((prev) => ({ ...prev, [page]: mappedBBoxes }));
        setOriginalTextsByPage((prev) => ({ ...prev, [page]: [] }));

        const newBlocks = (result.braille_text_list || []).map((item) => {
          const matchedBBox = mappedBBoxes.find(
            (b) => String(b.id) === String(item.id),
          );
          const contents = itemContents(item);
          return {
            id: String(item.id),
            originalText: '',
            currentText: contents[0] || '',
            candidates: contents.length > 1 ? contents : [],
            bbox: matchedBBox,
            isBlocked: item.is_blocked,
            ruleTrail: item.rule_trail,
          };
        });

        setBlocksForPage(page, newBlocks);
        return;
      }

      // [CASE B] 점역 변환 (텍스트 → 점자): text_list(원본) + braille_text_list(결과)
      if (activeTab === TABS.BRAILLE) {
        const mappedOriginalTexts = mapOriginalTexts(result.text_list);
        setOriginalTextsByPage((prev) => ({
          ...prev,
          [page]: mappedOriginalTexts,
        }));

        const newBlocks = (result.braille_text_list || []).map((item) => {
          const originalItem = (result.text_list || []).find(
            (t) => String(t.id) === String(item.id),
          );
          const contents = itemContents(item);
          return {
            id: String(item.id),
            originalText: originalItem ? itemContents(originalItem)[0] || '' : '',
            currentText: contents[0] || '',
            candidates: contents.length > 1 ? contents : [],
            bbox: undefined,
            isBlocked: item.is_blocked,
            ruleTrail: item.rule_trail,
          };
        });

        setBlocksForPage(page, newBlocks);
        return;
      }

      // [CASE A] OCR 변환 (이미지 → 텍스트): text_list + bbox, contents는 후보 배열
      const mappedBBoxes = mapBoundingBoxes(result.bounding_box_list);
      setBboxDataByPage((prev) => ({ ...prev, [page]: mappedBBoxes }));

      const mappedOriginalTexts = mapOriginalTexts(result.text_list);
      setOriginalTextsByPage((prev) => ({
        ...prev,
        [page]: mappedOriginalTexts,
      }));

      const newBlocks = (result.text_list || []).map((item) => {
        const matchedBBox = mappedBBoxes.find(
          (b) => String(b.id) === String(item.id),
        );
        const contents = itemContents(item);
        // OcrTextItem만 is_blocked/rule_trail을 가진다 (PlainTextItem에는 없음)
        const ocr = item as { is_blocked?: boolean; rule_trail?: TranslationBlock['ruleTrail'] };
        return {
          id: String(item.id),
          originalText: contents[0] || '',
          currentText: contents[0] || '',
          candidates: contents.length > 1 ? contents : [],
          bbox: matchedBBox,
          isBlocked: ocr.is_blocked,
          ruleTrail: ocr.rule_trail,
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
