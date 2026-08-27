import { useState, useCallback, useEffect } from 'react';
import { ConversionTab, FileState, FileType } from '../types';
import { parseHwpToText } from '../component/shared/HwpParser';
import { logDiag } from '../utils/diagLog';
import {
  detectFileType,
  fileSizeMessage,
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

      // 용량은 **받는 자리에서** 거른다. 예전에는 업로드 단계에서만 봐서, 상한을 넘긴
      // 파일도 일단 화면에 올라간 뒤 이유 없는 "업로드 실패"만 떴다 — 파일명이 상단과
      // 원본 칸에 그대로 남고 미리보기는 계속 도는 상태로 갇혔다(2026-08-26 통합시험).
      const sizeError = fileSizeMessage(file);
      if (sizeError) {
        setFileState((prev) => {
          if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return { ...EMPTY_STATE, error: sizeError };
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
        // alert는 창 전체를 멈춘다 — 용량 초과와 같은 안내 자리(error 상태)에 띄운다.
        logDiag('파일 읽기', file.name, error);
        setFileState((prev) => {
          if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return {
            ...EMPTY_STATE,
            error: '파일을 처리하는 중 오류가 발생했습니다. 파일이 손상되지 않았는지 확인해 주세요.',
          };
        });
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
      isRestoredPages?: boolean;
      previewPage?: number;
    }) => {
      setFileState((prev) => {
        if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return {
          ...prev,
          file: null,
          fileType: preview.fileType,
          previewUrl: preview.previewUrl ?? null,
          textContent: preview.textContent ?? '',
          isRestoredPages: preview.isRestoredPages ?? false,
          previewPage: preview.previewPage,
          error: null,
        };
      });
    },
    [],
  );

  // 탭 전환 시 저장해 둔 입력 상태를 복원한다. 미리보기 blob URL은 탭 전환 과정에서
  // revoke 되므로, 원본 File이 있으면 새 blob URL을 재생성한다(없으면 저장된 URL 그대로).
  const restoreState = useCallback((snapshot: FileState) => {
    setFileState((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      let previewUrl = snapshot.previewUrl;
      if (
        snapshot.file &&
        (snapshot.fileType === 'pdf' || snapshot.fileType === 'image')
      ) {
        previewUrl = URL.createObjectURL(snapshot.file);
      }
      return { ...snapshot, previewUrl };
    });
  }, []);

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
    restoreState,
    setPage,
    setTotalPages,
    setFileError,
    reset,
  };
};
