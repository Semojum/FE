import { useCallback, useState } from 'react';
import { getJob, saveJob } from '../api/HistoryService';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from '../types';
import { JobDetail } from '../types/auth';

interface CurrentJobState {
  activeTab: ConversionTab;
  fileName: string;
  totalPages: number;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
}

interface UseSavedJobsOptions {
  token: string | null;
  current: CurrentJobState;
  onAuthRequired: () => void;
  onJobLoaded: (job: JobDetail) => void;
}

export const useSavedJobs = ({
  token,
  current,
  onAuthRequired,
  onJobLoaded,
}: UseSavedJobsOptions) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveJob = useCallback(async () => {
    if (!token) {
      onAuthRequired();
      return;
    }
    if (Object.keys(current.blocksByPage).length === 0) {
      alert('저장할 결과가 없습니다.');
      return;
    }
    const defaultTitle = current.fileName || `${current.activeTab} 작업`;
    const title = window.prompt('작업 이름을 입력하세요', defaultTitle);
    if (!title) return;

    setIsSaving(true);
    try {
      await saveJob(token, {
        title,
        mode: current.activeTab,
        fileName: current.fileName,
        totalPages: current.totalPages,
        blocksByPage: current.blocksByPage,
        bboxDataByPage: current.bboxDataByPage,
        originalTextsByPage: current.originalTextsByPage,
        imgResolution: current.imgResolution,
      });
      alert('저장되었습니다.');
    } catch (err) {
      alert(
        err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.',
      );
    } finally {
      setIsSaving(false);
    }
  }, [token, current, onAuthRequired]);

  const handleSelectJob = useCallback(
    async (jobId: string) => {
      if (!token) return;
      try {
        const job = await getJob(token, jobId);
        onJobLoaded(job);
      } catch (err) {
        alert(
          err instanceof Error ? err.message : '작업을 불러오지 못했습니다.',
        );
      }
    },
    [token, onJobLoaded],
  );

  return { isSaving, handleSaveJob, handleSelectJob };
};
