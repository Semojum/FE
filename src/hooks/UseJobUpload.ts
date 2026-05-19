// src/hooks/useJobUpload.ts
import { useState, useCallback } from 'react';
import { JobMode, StartJobResponse } from '../types/apiTypes';
import { ConversionTab, TABS } from '../types';
import { startJob } from '../api/JobService';

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

const mapTabToMode = (tab: ConversionTab): JobMode => {
  if (tab === TABS.OCR) return 'a';
  if (tab === TABS.BRAILLE) return 'b';
  return 'c';
};

export const useJobUpload = (): UseJobUploadReturn => {
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File, activeTab: ConversionTab) => {
      setIsUploading(true);
      setError(null);
      setJobId(null);

      const mode = mapTabToMode(activeTab);

      try {
        const data = await startJob(file, mode);
        setJobId(data.job_id);
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Upload failed';
        console.error('Upload failed:', errorMessage);
        setError(errorMessage);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const resetUpload = useCallback(() => {
    setJobId(null);
    setError(null);
    setIsUploading(false);
  }, []);

  return { uploadFile, isUploading, jobId, error, resetUpload };
};
