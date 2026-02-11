import { useState, useCallback, useEffect } from 'react';
import { FileState, FileType } from '../types';

export const useFileHandler = () => {
  const [fileState, setFileState] = useState<FileState>({
    file: null,
    previewUrl: null,
    fileType: null,
    textContent: '', // 텍스트 파일 내용을 저장할 필드 추가
    currentPage: 1,
    totalPages: 0,
  });

  /**
   * @description 파일 드롭 핸들러 (비동기 처리)
   */
  const handleFileDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // 1. 파일 타입 판별 (MIME Type 및 확장자 체크)
    let fileType: FileType = 'text';
    if (file.type.includes('pdf')) {
      fileType = 'pdf';
    } else if (file.type.includes('image')) {
      fileType = 'image';
    } else if (file.name.endsWith('.hwp') || file.type.includes('hwp')) {
      fileType = 'hwp';
    } else if (file.type === 'text/plain') {
      fileType = 'text';
    }

    // 2. 타입별 데이터 준비
    let previewUrl: string | null = null;
    let textContent: string = '';

    if (fileType === 'pdf' || fileType === 'image') {
      // 이미지/PDF는 브라우저 렌더링을 위한 Blob URL 생성
      previewUrl = URL.createObjectURL(file);
    } else if (fileType === 'text') {
      // 텍스트 파일은 내용을 직접 읽음
      textContent = await file.text();
    }

    // 3. 상태 업데이트
    setFileState((prev) => {
      // 이전 미리보기 URL이 있다면 메모리 해제 (중요)
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);

      return {
        file,
        previewUrl,
        fileType,
        textContent,
        currentPage: 1,
        totalPages: 0,
      };
    });
  }, []);

  const setPage = useCallback((page: number) => {
    setFileState((prev) => ({ ...prev, currentPage: page }));
  }, []);

  const setTotalPages = useCallback((num: number) => {
    setFileState((prev) => ({ ...prev, totalPages: num }));
  }, []);

  /**
   * @description 상태 초기화
   */
  const reset = useCallback(() => {
    setFileState((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        file: null,
        previewUrl: null,
        fileType: null,
        textContent: '',
        currentPage: 1,
        totalPages: 0,
      };
    });
  }, []);

  // 컴포넌트 언마운트 시 메모리 정리
  useEffect(() => {
    return () => {
      if (fileState.previewUrl) URL.revokeObjectURL(fileState.previewUrl);
    };
  }, [fileState.previewUrl]);

  return { fileState, handleFileDrop, setPage, setTotalPages, reset };
};
