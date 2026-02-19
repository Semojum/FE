// src/hooks/useJobUpload.ts
import { useState, useCallback } from 'react';
import { JobMode, StartJobResponse } from '../types/apiTypes';
import { ConversionTab } from '../types';
import { startJob } from '../api/JobService'; // 확장자 .ts 제거 (일반적인 import 방식)

// 로그 스타일 정의 (파란색 계열)
const LOG_STYLE =
  'background: #2563EB; color: #fff; padding: 2px 4px; border-radius: 2px; font-weight: bold;';

interface UseJobUploadReturn {
  uploadFile: (
    file: File,
    activeTab: ConversionTab,
  ) => Promise<StartJobResponse | null>;
  isUploading: boolean;
  jobId: string | null;
  error: string | null;
  resetUpload: () => void;
}

export const useJobUpload = (): UseJobUploadReturn => {
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mapTabToMode = (tab: ConversionTab): JobMode => {
    if (tab === 'OCR 변환') {
      return 'a';
    }
    else if (tab == '점역 변환') {
      return 'b';
    }
    else {
      return 'c';
    }
  };

  const uploadFile = useCallback(
    async (file: File, activeTab: ConversionTab) => {
      setIsUploading(true);
      setError(null);
      setJobId(null);

      const mode = mapTabToMode(activeTab);
      const startTime = performance.now(); // 시간 측정 시작

      // 1. 업로드 시작 로그 그룹 열기
      console.groupCollapsed(`%c 📤 Upload Started: ${file.name} `, LOG_STYLE);
      console.log('Mode:', mode);
      console.log('File Size:', (file.size / 1024 / 1024).toFixed(2) + ' MB');

      try {
        // API 호출
        const data = await startJob(file, mode);

        const endTime = performance.now(); // 시간 측정 종료
        setJobId(data.job_id);

        // 2. 성공 로그
        console.log(
          `✅ Upload Success (${((endTime - startTime) / 1000).toFixed(2)}s)`,
        );
        console.log('Response Data:', data);
        console.groupEnd(); // 그룹 닫기

        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Upload failed';

        // 3. 실패 로그
        console.error('❌ Upload Failed:', errorMessage);
        console.groupEnd(); // 그룹 닫기 (에러 나도 닫아야 함)

        setError(errorMessage);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const resetUpload = useCallback(() => {
    console.log('%c 🔄 Upload Reset ', 'color: gray; font-style: italic;');
    setJobId(null);
    setError(null);
    setIsUploading(false);
  }, []);

  return { uploadFile, isUploading, jobId, error, resetUpload };
};
