import { useState, useCallback, useEffect } from 'react';
import { FileState, FileType } from '../types';
import  {
  parseHwpToText
} from '../component/shared/HwpParser';

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

    let fileType: FileType = 'text';
    if (file.type.includes('pdf')) fileType = 'pdf';
    else if (file.type.includes('image')) fileType = 'image';
    else if (file.name.endsWith('.hwp')) fileType = 'hwp';

    let textContent = '';
    let previewUrl: string | null = null;

    try {
      // 타입별 텍스트 추출 로직 분기
      if (fileType === 'hwp') {
        textContent = await parseHwpToText(file); // 유틸리티 호출
      } else if (fileType === 'text') {
        textContent = await file.text();
      } else if (fileType === 'pdf' || fileType === 'image') {
        previewUrl = URL.createObjectURL(file);
      }

      setFileState((prev) => {
        if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return {
          file,
          previewUrl,
          fileType,
          textContent, // 점자 변환에 사용될 원본 텍스트
          currentPage: 1,
          totalPages: 0,
        };
      });
    } catch (error) {
      console.error(error);
      alert('파일을 처리하는 중 오류가 발생했습니다.');
    }
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
