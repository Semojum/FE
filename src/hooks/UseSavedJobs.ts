import { useCallback, useState } from 'react';
import { getJobPage } from '../api/HistoryService';
import { ApiError } from '../api/apiClient';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TABS,
  TranslationBlock,
} from '../types';
import { JobDetail, JobSummary } from '../types/auth';
import { JobMode } from '../types/apiTypes';
import { mapPageResult } from '../utils/mapPageResult';

// 서버 mode(a/b/c) → 앱 내부 탭. UseJobUpload의 mapTabToMode와 역대응.
const modeToTab = (mode: JobMode): ConversionTab => {
  if (mode === 'a') return TABS.OCR;
  if (mode === 'b') return TABS.BRAILLE;
  return TABS.INTEGRATED;
};

interface UseSavedJobsOptions {
  token: string | null;
  onJobLoaded: (job: JobDetail) => void;
}

export const useSavedJobs = ({ token, onJobLoaded }: UseSavedJobsOptions) => {
  const [isLoading, setIsLoading] = useState(false);

  // 마이페이지에서 작업을 선택하면 페이지별로 결과를 받아 앱 상태로 복원한다.
  const handleSelectJob = useCallback(
    async (job: JobSummary) => {
      if (!token) return;
      setIsLoading(true);

      const tab = modeToTab(job.mode);
      const blocksByPage: Record<number, TranslationBlock[]> = {};
      const bboxDataByPage: Record<number, BoundingBox[]> = {};
      const originalTextsByPage: Record<number, OriginalTextBlock[]> = {};
      let imgResolution: ImageResolution = { width: 0, height: 0 };

      try {
        for (let page = 1; page <= job.totalPages; page += 1) {
          let pageData;
          try {
            pageData = await getJobPage(token, job.jobId, page);
          } catch (e) {
            // 아직 변환 결과가 없는 페이지(JOB4001)는 건너뛴다.
            // 그 외(인증 만료 등)는 표면화해 사용자에게 알린다.
            if (e instanceof ApiError && e.code === 'JOB4001') continue;
            throw e;
          }
          const mapped = mapPageResult(tab, pageData.result ?? {});
          blocksByPage[page] = mapped.blocks;
          bboxDataByPage[page] = mapped.bboxes;
          originalTextsByPage[page] = mapped.originalTexts;
          if (mapped.imgResolution) imgResolution = mapped.imgResolution;
        }

        onJobLoaded({
          mode: tab,
          totalPages: job.totalPages,
          thumbnailUrl: job.thumbnailUrl,
          blocksByPage,
          bboxDataByPage,
          originalTextsByPage,
          imgResolution,
        });
      } catch (err) {
        alert(
          err instanceof Error ? err.message : '작업을 불러오지 못했습니다.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [token, onJobLoaded],
  );

  return { isLoading, handleSelectJob };
};
