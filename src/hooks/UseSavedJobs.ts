import { useCallback, useState } from 'react';
import { getJobPage } from '../api/HistoryService';
import { ApiError } from '../api/apiClient';
import { toUserMessage } from '../api/errorMessages';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TABS,
  TranslationBlock,
} from '../types';
import { JobDetail, JobPageOriginal, JobRef } from '../types/auth';
import { JobMode } from '../types/apiTypes';
import { mapPageResult } from '../utils/mapPageResult';

// 서버 mode(a/b/c) → 앱 내부 탭. UseJobUpload의 mapTabToMode와 역대응.
export const modeToTab = (mode: JobMode): ConversionTab => {
  if (mode === 'a') return TABS.OCR;
  if (mode === 'b') return TABS.BRAILLE;
  return TABS.INTEGRATED;
};

// 점역(b) 저장본은 원본 텍스트가 result.text_list가 아니라 페이지 응답의
// original.lines로 내려온다. 한 페이지의 원본 줄들을 한 블록으로 합쳐 복원한다.
const originalTextsFromOriginal = (
  original: JobPageOriginal | undefined,
  page: number,
): OriginalTextBlock[] => {
  const lines = Array.isArray(original?.lines)
    ? original.lines.filter((l): l is string => typeof l === 'string')
    : [];
  if (lines.length === 0) return [];
  return [{ id: `original-${page}`, content: lines.join('\n') }];
};

interface UseSavedJobsOptions {
  token: string | null;
  onJobLoaded: (job: JobDetail) => void;
  onError?: (message: string) => void;
}

export const useSavedJobs = ({
  token,
  onJobLoaded,
  onError,
}: UseSavedJobsOptions) => {
  const [isLoading, setIsLoading] = useState(false);

  // 마이페이지에서 작업을 선택하면 페이지별로 결과를 받아 앱 상태로 복원한다.
  const handleSelectJob = useCallback(
    async (job: JobRef) => {
      if (!token) return;
      setIsLoading(true);

      const tab = modeToTab(job.mode);
      const blocksByPage: Record<number, TranslationBlock[]> = {};
      const bboxDataByPage: Record<number, BoundingBox[]> = {};
      const originalTextsByPage: Record<number, OriginalTextBlock[]> = {};
      const originalByPage: Record<number, JobPageOriginal> = {};
      let imgResolution: ImageResolution = { width: 0, height: 0 };
      let failedPages: number[] = [];
      let insertPageNumber = false;
      let originalFileName = '';

      try {
        // 쪽별 조회를 여러 개씩 겹쳐 부른다.
        //
        // 예전에는 1쪽부터 마지막 쪽까지 **한 번에 하나씩** 기다렸다. 왕복 한 번이
        // 0.7~1초쯤이라 10쪽짜리는 열기만 5~10초가 걸렸다(2026-08-26 QA). 쪽끼리는
        // 서로 기다릴 이유가 없다. 서버·회선을 한꺼번에 때리지 않도록 몇 개씩만 겹친다.
        const CONCURRENCY = 5;
        const pages = Array.from({ length: job.totalPages }, (_, i) => i + 1);
        const results: Array<
          [number, Awaited<ReturnType<typeof getJobPage>>] | null
        > = new Array(pages.length).fill(null);

        let next = 0;
        const worker = async () => {
          for (;;) {
            const idx = next;
            next += 1;
            if (idx >= pages.length) return;
            const page = pages[idx];
            try {
              results[idx] = [page, await getJobPage(token, job.jobId, page)];
            } catch (e) {
              // 아직 변환 결과가 없는 페이지(JOB4001)는 건너뛴다.
              // 그 외(인증 만료 등)는 표면화해 사용자에게 알린다.
              if (e instanceof ApiError && e.code === 'JOB4001') continue;
              throw e;
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker),
        );

        // 쪽 번호 순서대로 정리한다 — 받은 순서는 뒤섞일 수 있다.
        for (const entry of results) {
          if (!entry) continue;
          const [page, pageData] = entry;
          const mapped = mapPageResult(tab, pageData.result ?? {});
          blocksByPage[page] = mapped.blocks;
          bboxDataByPage[page] = mapped.bboxes;
          // text_list 기반 원본이 비면(점역 저장본) original.lines로 폴백한다.
          originalTextsByPage[page] =
            mapped.originalTexts.length > 0
              ? mapped.originalTexts
              : originalTextsFromOriginal(pageData.original, page);
          if (pageData.original) originalByPage[page] = pageData.original;
          if (mapped.imgResolution) imgResolution = mapped.imgResolution;
          // failedPages·insertPageNumber·originalFileName은 페이지마다 같은 값이 내려온다.
          failedPages = pageData.failedPages ?? failedPages;
          insertPageNumber = pageData.insertPageNumber ?? insertPageNumber;
          originalFileName = pageData.originalFileName || originalFileName;
        }

        onJobLoaded({
          jobId: job.jobId,
          mode: tab,
          totalPages: job.totalPages,
          failedPages,
          insertPageNumber,
          originalFileName: originalFileName || undefined,
          startPage: job.startPage ?? 1,
          thumbnailUrl: job.thumbnailUrl ?? undefined,
          blocksByPage,
          bboxDataByPage,
          originalTextsByPage,
          originalByPage,
          imgResolution,
        });
      } catch (err) {
        const message = toUserMessage(err, '작업을 불러오지 못했습니다.');
        if (onError) onError(message);
        else console.error(message, err);
      } finally {
        setIsLoading(false);
      }
    },
    [token, onJobLoaded, onError],
  );

  return { isLoading, handleSelectJob };
};
