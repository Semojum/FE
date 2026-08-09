// src/hooks/useJobUpload.ts
import { useState, useCallback } from 'react';
import { JobMode, CreateJobResponse } from '../types/apiTypes';
import { ConversionTab, TABS } from '../types';
import { createJob } from '../api/JobService';
import { toUserMessage } from '../api/errorMessages';
import { fileSizeMessage, footerTextMessage } from '../utils/fileValidation';

interface UseJobUploadReturn {
  uploadFile: (
    file: File,
    activeTab: ConversionTab,
    token?: string | null,
    insertPageNumber?: boolean,
    footerText?: string,
  ) => Promise<CreateJobResponse | null>;
  isUploading: boolean;
  jobId: string | null;
  // 이 Job이 어느 모드로 만들어졌는지. SSE 결과를 해석할 때 "지금 보고 있는 탭"이
  // 아니라 이 값을 써야 한다 — 탭을 옮긴 직후 도착한 프레임이 엉뚱한 모드로
  // 매핑돼 그 페이지 결과가 통째로 비던 문제가 있었다.
  jobTab: ConversionTab | null;
  error: string | null;
  resetUpload: () => void;
  // 서버가 만들어 준 Job(점역으로 보내기 결과 등)을 스트림 대상으로 붙일 때 사용.
  attachJob: (jobId: string, tab: ConversionTab) => void;
}

export const mapTabToMode = (tab: ConversionTab): JobMode => {
  if (tab === TABS.OCR) return 'a';
  if (tab === TABS.BRAILLE) return 'b';
  return 'c';
};

export const useJobUpload = (): UseJobUploadReturn => {
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobTab, setJobTab] = useState<ConversionTab | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (
      file: File,
      activeTab: ConversionTab,
      token?: string | null,
      insertPageNumber = false,
      footerText = '',
    ) => {
      // 명세 "업로드 용량 처리(FE 필독)": 수백 MB를 몇 분간 올린 뒤 실패하는 상황과
      // 프록시가 먼저 끊어 비-JSON 응답이 오는 상황을 막기 위해 여기서 먼저 거른다.
      const sizeError = fileSizeMessage(file);
      if (sizeError) {
        setError(sizeError);
        return null;
      }

      // 꼬리말 200자 초과는 서버가 COMMON4000("잘못된 요청입니다")로만 알려준다.
      const footerError = footerTextMessage(footerText);
      if (footerError) {
        setError(footerError);
        return null;
      }

      setIsUploading(true);
      setError(null);
      setJobId(null);

      const mode = mapTabToMode(activeTab);

      try {
        const data = await createJob(
          file,
          mode,
          token,
          insertPageNumber,
          footerText,
        );
        setJobId(data.jobId);
        setJobTab(activeTab);
        return data;
      } catch (err) {
        const message = toUserMessage(err, '업로드에 실패했습니다.');
        console.error('Upload failed:', message);
        setError(message);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const resetUpload = useCallback(() => {
    setJobId(null);
    setJobTab(null);
    setError(null);
    setIsUploading(false);
  }, []);

  const attachJob = useCallback((id: string, tab: ConversionTab) => {
    setError(null);
    setJobId(id);
    setJobTab(tab);
  }, []);

  return {
    uploadFile,
    isUploading,
    jobId,
    jobTab,
    error,
    resetUpload,
    attachJob,
  };
};
