import { useState, useCallback, useEffect } from 'react';
import { FileState, FileType } from '../types';

export const useFileHandler = () => {
  const [fileState, setFileState] = useState<FileState>({
    file: null,
    previewUrl: null,
    fileType: null,
    currentPage: 1,
    totalPages: 0,
  });

  // useFileHandler.ts 내의 handleFileDrop 최적화 제안
  const handleFileDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // 이전 URL을 즉시 해제하여 메모리 누수 방지
      setFileState((prev) => {
        if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);

        const fileType: FileType = file.type.includes('pdf') ? 'pdf' : 'image';
        const previewUrl = URL.createObjectURL(file);

        return {
          file,
          previewUrl,
          fileType,
          currentPage: 1,
          totalPages: 0,
        };
      });
    },
    [], // 의존성 배열을 비워 함수 재생성을 원천 차단
  );

  const setPage = useCallback((page: number) => {
    setFileState((prev) => ({ ...prev, currentPage: page }));
  }, []);

  const setTotalPages = useCallback((num: number) => {
    setFileState((prev) => ({ ...prev, totalPages: num }));
  }, []);

  const reset = useCallback(() => {
    if (fileState.previewUrl) URL.revokeObjectURL(fileState.previewUrl);
    setFileState({
      file: null,
      previewUrl: null,
      fileType: null,
      currentPage: 1,
      totalPages: 0,
    });
  }, [fileState.previewUrl]);

  // 컴포넌트 언마운트 시 메모리 정리
  useEffect(() => {
    return () => {
      if (fileState.previewUrl) URL.revokeObjectURL(fileState.previewUrl);
    };
  }, [fileState.previewUrl]);

  return { fileState, handleFileDrop, setPage, setTotalPages, reset };
};;
