import { useState, useCallback, useEffect } from 'react';
import { ConversionTab, FileState, FileType } from '../types';
import { parseHwpToText } from '../component/shared/HwpParser';
import {
  detectFileType,
  fileValidationMessage,
  isFileAllowedForTab,
} from '../utils/fileValidation';

const EMPTY_STATE: FileState = {
  file: null,
  previewUrl: null,
  fileType: null,
  textContent: '',
  currentPage: 1,
  totalPages: 0,
  error: null,
};

export const useFileHandler = () => {
  const [fileState, setFileState] = useState<FileState>(EMPTY_STATE);

  /**
   * @description 파일 드롭 핸들러 (비동기 처리)
   * @param activeTab 전달 시 해당 모드의 허용 파일 형식을 검증한다.
   */
  const handleFileDrop = useCallback(
    async (acceptedFiles: File[], activeTab?: ConversionTab) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // 모드별 허용 파일 검증 (명세: a=PDF, b=TXT/HWP, c=PDF)
      if (activeTab && !isFileAllowedForTab(file, activeTab)) {
        setFileState((prev) => {
          if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return { ...EMPTY_STATE, error: fileValidationMessage(activeTab) };
        });
        return;
      }

      const fileType = detectFileType(file);

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
            error: null,
          };
        });
      } catch (error) {
        console.error(error);
        alert('파일을 처리하는 중 오류가 발생했습니다.');
      }
    },
    [],
  );

  // 저장된 작업을 불러올 때 입력 미리보기를 복원한다. 원본 File은 서버에 없으므로
  // file은 null로 둬서 재업로드(useEffect 업로드 트리거)가 발생하지 않게 한다.
  const setRestoredPreview = useCallback(
    (preview: {
      fileType: FileType | null;
      previewUrl?: string | null;
      textContent?: string;
    }) => {
      setFileState((prev) => {
        if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return {
          ...prev,
          file: null,
          fileType: preview.fileType,
          previewUrl: preview.previewUrl ?? null,
          textContent: preview.textContent ?? '',
          error: null,
        };
      });
    },
    [],
  );

  const setPage = useCallback((page: number) => {
    setFileState((prev) => ({ ...prev, currentPage: page }));
  }, []);

  const setTotalPages = useCallback((num: number) => {
    setFileState((prev) => ({ ...prev, totalPages: num }));
  }, []);

  // 검증 실패 메시지를 외부(드롭 거부 핸들러 등)에서 설정/해제
  const setFileError = useCallback((message: string | null) => {
    setFileState((prev) => ({ ...prev, error: message }));
  }, []);

  /**
   * @description 상태 초기화
   */
  const reset = useCallback(() => {
    setFileState((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { ...EMPTY_STATE };
    });
  }, []);

  // 컴포넌트 언마운트 시 메모리 정리
  useEffect(() => {
    return () => {
      if (fileState.previewUrl) URL.revokeObjectURL(fileState.previewUrl);
    };
  }, [fileState.previewUrl]);

  return {
    fileState,
    handleFileDrop,
    setRestoredPreview,
    setPage,
    setTotalPages,
    setFileError,
    reset,
  };
};
